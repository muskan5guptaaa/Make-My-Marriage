import { z } from 'zod';

export const askSchema = z.object({
  question: z.string({ message: 'Type a question.' }).trim().min(1, 'Type a question.').max(500, 'Keep the question under 500 characters.'),
});
