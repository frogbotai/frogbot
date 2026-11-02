import { text } from '../../text';

export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(text);
}
