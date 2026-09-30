export interface RequestWithUser {
  user: {
    id: string;
    email?: string;
    role?: string;
    name?: string;
  };
}
