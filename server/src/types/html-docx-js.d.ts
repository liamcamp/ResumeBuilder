declare module 'html-docx-js' {
  export function asBuffer(html: string, options?: any): Buffer;
  export function asBlob(html: string, options?: any): Blob;
  const _default: {
    asBuffer: typeof asBuffer;
    asBlob: typeof asBlob;
  };
  export default _default;
}
