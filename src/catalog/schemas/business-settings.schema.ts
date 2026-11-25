/**
 * The settings entity lives with its MongoDB adapter. This path stays for the
 * modules that have not migrated yet (they still read the schema).
 * @deprecated Import from `infrastructure/persistence/mongo/business-settings.entity`.
 */
export * from '../infrastructure/persistence/mongo/business-settings.entity';
