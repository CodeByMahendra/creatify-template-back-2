export function buildPanFilter(outW: number, outH: number, duration: number, direction: string) {
const sw = Math.round(outW * 1.25);
const sh = Math.round(outH * 1.25);
let exprX = '0';
let exprY = '0';
if (direction === 'left') exprX = `(in_w-out_w)*t/${duration}`;
if (direction === 'right') exprX = `(in_w-out_w)*(1 - t/${duration})`;
if (direction === 'top') exprY = `(in_h-out_h)*t/${duration}`;
if (direction === 'bottom') exprY = `(in_h-out_h)*(1 - t/${duration})`;
return `scale=${sw}:${sh},crop=${outW}:${outH}:x='${exprX}':y='${exprY}'`;
}



// export function horizontalPanFilter({ outW = 1280, outH = 720, scaleFactor = 1.25, duration = 5, vertical = false }: any) {
// const sw = Math.round(outW * scaleFactor);
// const sh = Math.round(outH * scaleFactor);
// const xExpr = `(in_w-out_w)*t/${duration}`;
// const yExpr = `0`;
// return `scale=${sw}:${sh},crop=${outW}:${outH}:x='${xExpr}':y='${yExpr}',format=yuv420p`;
// }