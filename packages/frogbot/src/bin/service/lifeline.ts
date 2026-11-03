import { Socket } from 'node:net';

const fd = Number(process.env.FROGBOT_LIFELINE_FD);

delete process.env.FROGBOT_LIFELINE_FD;

if (fd) {
  const line = new Socket({ fd, readable: true, writable: false });
  const end = () => process.exit(0);

  line.on('end', end).on('close', end).on('error', end);
  line.resume();
  line.unref();
}
