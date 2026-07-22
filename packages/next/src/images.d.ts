declare module '*.jpg' {
  const asset: { src: string; height: number; width: number } | string;
  export default asset;
}

declare module '*.png' {
  const asset: { src: string; height: number; width: number } | string;
  export default asset;
}
