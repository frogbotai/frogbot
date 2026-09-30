export const resolveFileFromOptions = async (file: Blob | string): Promise<Blob> => {
  if (typeof file !== 'string') return file;

  const response = await fetch(file);
  const fileName = file.split('/').pop() ?? '';
  const blob = await response.blob();

  return new File([blob], fileName, { type: blob.type });
};
