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



export function overlayTextBoxEffect(
  overlayText: string,
  duration: number,
  fadeIn = 0.5,
  fadeOut = 0.5,
) {
  const fontPath = 'C\\:/Windows/Fonts/arial.ttf';
  const fontSize = 48;
  const maxBoxWidth = width - 100;
  const paddingH = 60;
  const paddingV = 40;
  const lineSpacing = 10;

  const avgCharWidth = fontSize * 0.6;
  const maxCharsPerLine = Math.floor((maxBoxWidth - paddingH) / avgCharWidth);

  const words = overlayText.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (testLine.length <= maxCharsPerLine) currentLine = testLine;
    else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  const longestLine = lines.reduce((a, b) => (a.length > b.length ? a : b), '');
  const boxW = Math.min(
    longestLine.length * avgCharWidth + paddingH,
    maxBoxWidth,
  );
  const boxH =
    fontSize * lines.length + lineSpacing * (lines.length - 1) + paddingV;
  const boxX = Math.round((width - boxW) / 2);
  const boxY = Math.round(height / 4);

  let filter = `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=black@0.45:t=fill:enable='between(t,${fadeIn},${duration - fadeOut})'`;
  filter += `,drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=white@0.2:t=2:enable='between(t,${fadeIn},${duration - fadeOut})'`;

  lines.forEach((line, lineIdx) => {
    const textX = `(w-text_w)/2`;
    const textY =
      boxY + Math.round(paddingV / 2) + lineIdx * (fontSize + lineSpacing);
    const escapedLine = line.replace(/'/g, "'\\\\\\''");

    filter += `,drawtext=fontfile='${fontPath}':text='${escapedLine}':x=${textX}+2:y=${textY}+2:fontsize=${fontSize}:fontcolor=black@0.6:enable='between(t,${fadeIn},${duration - fadeOut})'`;
    filter += `,drawtext=fontfile='${fontPath}':text='${escapedLine}':x=${textX}:y=${textY}:fontsize=${fontSize}:fontcolor=white:enable='between(t,${fadeIn},${duration - fadeOut})'`;
  });

  return filter;
}




export function dualZoom25to50Effect(duration: number) {
  const zoomDuration = 2.0; // seconds — zoom only for 2.5 sec
  const smallW = Math.round(width / 4);
  const smallH = Math.round(height / 4);
  const halfHeight = Math.round(height / 2);

  const startZoom = 1.0;
  const endZoom = 2.8;
  const zoomSpeed = (endZoom - startZoom) / zoomDuration; // zoom speed for 2.5s

  const totalFrames = Math.round(duration * fps);

  // zoomExpr: zooms until 2.5s, then holds
  const zoomExpr = `if(lt(on,${zoomDuration * fps}),min(${endZoom},zoom+${zoomSpeed}/25),${endZoom})`;

  return [
    `[0:v]scale=${smallW}:${smallH},` +
      `pad=${width}:${halfHeight}:(ow-iw)/2:(oh-ih)/2:white,` +
      `zoompan=z='${zoomExpr}':d=${totalFrames}:x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':s=${width}x${halfHeight}:fps=${fps},` +
      `trim=duration=${duration},setpts=PTS-STARTPTS[top_half];`,

    `[1:v]scale=${smallW}:${smallH},` +
      `pad=${width}:${halfHeight}:(ow-iw)/2:(oh-ih)/2:white,` +
      `zoompan=z='${zoomExpr}':d=${totalFrames}:x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':s=${width}x${halfHeight}:fps=${fps},` +
      `trim=duration=${duration},setpts=PTS-STARTPTS[bottom_half];`,

    `[top_half][bottom_half]vstack=inputs=2,trim=duration=${duration},setpts=PTS-STARTPTS[v]`,
  ].join('');
}

export function blurEffect(duration: number, fadeIn = 0.5, fadeOut = 0.5) {
  return `gblur=sigma=15:enable='between(t,0,${fadeIn})',gblur=sigma=0:enable='between(t,${duration - fadeOut},${duration})'`;
}

export const VIDEO_WIDTH = 1280;
export const VIDEO_HEIGHT = 720;
export function imageScaleAndFade(duration: number, fadeDur = 0.5) {
  const w = Math.floor(VIDEO_WIDTH * 0.3);
  const h = Math.floor(VIDEO_HEIGHT * 0.4);
  const fadeOutStart = Math.max(0, duration - fadeDur);

  return `scale=${w}:${h},format=rgba,fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${fadeOutStart}:d=${fadeDur}`;
}

export function slideInHoldOutOverlay(
  slideIn = 0.5,
  hold = 2.5,
  slideOut = 0.5,
) {
  const total = slideIn + hold + slideOut;

  const centerX = `(W-w)/2`;
  const xExpr = `if(lt(t\\,${slideIn})\\, W + (t/${slideIn})*(${centerX} - W)\\, if(lt(t\\,${slideIn + hold})\\, ${centerX}\\, ${centerX} - ((t - ${slideIn + hold})/${slideOut})*(${centerX} + w)))`;
  const yExpr = `H-h-50`;
  return `overlay=x='${xExpr}':y='${yExpr}':enable='between(t,0,${total})'`;
}

export function drawTextFilter(
  safeText: string,
  duration: number,
  fontPath = `C\\:/Windows/Fonts/arial.ttf`,
) {
  const fontSize = 28;
  const textX = `(w-text_w)/2`;
  const textY = `h-300`;
  return `drawtext=fontfile='${fontPath}':text='${safeText}':x=${textX}:y=${textY}:fontsize=${fontSize}:fontcolor=white:enable='between(t,0,${duration})':shadowx=2:shadowy=2:shadowcolor=black`;
}

