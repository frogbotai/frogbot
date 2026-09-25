export function validateVector(
  value: unknown,
  dimensions: number,
  required: boolean,
): string | true {
  if (value === undefined || value === null) {
    return required ? 'A vector is required.' : true;
  }

  if (!Array.isArray(value)) {
    return 'A vector must be an array of finite numbers.';
  }

  if (value.length !== dimensions) {
    return `A vector must contain exactly ${dimensions} numbers.`;
  }

  if (value.some((coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate))) {
    return 'A vector must contain only finite numbers.';
  }

  return true;
}
