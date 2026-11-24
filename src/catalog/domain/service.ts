export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: number;
  /** Ids of the professionals that offer the service. */
  professionals: string[];
  icon: string;
  active: boolean;
}

/** Everything a new service is stored with, but its id. */
export type NewService = Omit<Service, 'id'>;

/** The fields an edit may change. */
export type ServicePatch = Partial<
  Pick<
    Service,
    'name' | 'description' | 'price' | 'duration' | 'professionals' | 'active'
  >
>;
