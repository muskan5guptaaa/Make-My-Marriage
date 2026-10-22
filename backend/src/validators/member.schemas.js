import { z } from 'zod';

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
});

export const roleSchema = z.object({
  role: z.enum(['owner', 'co-admin'], { message: 'Role must be owner or co-admin.' }),
});
