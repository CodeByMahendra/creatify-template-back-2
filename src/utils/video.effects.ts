const width = 1280;
const height = 720;
const fps = 25;

export function zoomPanEffect(duration: number, direction: string) {
  let exprX = '0';
  let exprY = '0';

  if (direction === 'left') exprX = `(in_w-out_w)*t/${duration}`;
  if (direction === 'right') exprX = `(in_w-out_w)*(1 - t/${duration})`;
  if (direction === 'top') exprY = `(in_h-out_h)*t/${duration}`;
  if (direction === 'bottom') exprY = `(in_h-out_h)*(1 - t/${duration})`;
  if (direction === 'center')
    ((exprX = '(in_w-out_w)/2'), (exprY = '(in_h-out_h)/2'));

  const scaleW = Math.round(width * 1.25);
  const scaleH = Math.round(height * 1.25);

  return `scale=${scaleW}:${scaleH},crop=${width}:${height}:x='${exprX}':y='${exprY}',setpts=PTS-STARTPTS,fps=${fps},format=yuv420p`;
}





