export function parseNumbers(values: unknown[]) {
  const numbers: number[] = [];
  const errors: { location: number; value: unknown }[] = [];

  values.forEach((value, location) => {
    const number = Number(value);

    if (Number.isNaN(number)) {
      errors.push({ value, location });

      return;
    }

    numbers.push(number);
  });

  if (errors.length > 0) {
    throw new Error(JSON.stringify({ message: 'The following values are not numbers', errors }));
  }

  return numbers;
}
