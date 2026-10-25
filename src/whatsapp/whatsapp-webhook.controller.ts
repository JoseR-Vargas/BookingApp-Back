import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ProcessedMessageService } from './processed-message.service';
import { WhatsappMessageHandler } from './whatsapp-message.handler';
import { WhatsappConfig } from './whatsapp.config';
import { parseWebhookPayload } from './whatsapp.payload.parser';
import { safeEqual, verifySignature } from './whatsapp.security';

@Controller('webhook/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly config: WhatsappConfig,
    private readonly processed: ProcessedMessageService,
    private readonly handler: WhatsappMessageHandler,
  ) {}

  /** Meta subscription handshake: echo `hub.challenge` if the token matches. */
  @Get()
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = this.config.verifyToken;
    if (
      !expected ||
      mode !== 'subscribe' ||
      typeof token !== 'string' ||
      typeof challenge !== 'string' ||
      !safeEqual(token, expected)
    ) {
      throw new ForbiddenException();
    }
    return challenge;
  }

  /**
   * Inbound messages. Messages are processed before answering because
   * serverless platforms freeze the function once the response is sent.
   * Failures are isolated per message so Meta never sees a 5xx for them.
   */
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ): Promise<{ received: true }> {
    if (!verifySignature(req.rawBody, signature, this.config.appSecret)) {
      throw new UnauthorizedException();
    }

    for (const message of parseWebhookPayload(body)) {
      try {
        if (!(await this.processed.claim(message.messageId))) {
          this.logger.log(`Duplicate message ${message.messageId} skipped`);
          continue;
        }
        await this.handler.handle(message);
      } catch (error) {
        this.logger.error(
          `Failed to process message ${message.messageId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return { received: true };
  }
}
