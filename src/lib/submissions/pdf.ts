/** A PDF in a 제출물: by its name, and by its content starting with the %PDF header. */
export const isPdf = (path: string) => path.toLowerCase().endsWith(".pdf");

export const hasPdfHeader = (data: Uint8Array) => new TextDecoder().decode(data.subarray(0, 5)) === "%PDF-";
