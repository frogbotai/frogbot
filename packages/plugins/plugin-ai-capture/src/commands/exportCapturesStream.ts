export type CaptureOutput = {
  write(value: string, callback: (error?: Error | null) => void): boolean;
};

export function writeCaptureLine(output: CaptureOutput, json: string): Promise<void> {
  return new Promise((resolve, reject) => {
    output.write(`${json}\n`, (error) => (error ? reject(error) : resolve()));
  });
}
