export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(
    `${process.env.SERVICE_GREETING ?? ''}|${process.env.NEXT_PUBLIC_SERVICE_NAME ?? ''}`,
  );
}
