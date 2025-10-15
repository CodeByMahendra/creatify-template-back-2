


import { spawn } from 'child_process';

export function escapeFfmpegPath(filePath: string, isListFile = false): string {
  if (!filePath) return '';

  let escaped = filePath.replace(/\\/g, '/');

  if (!isListFile) return escaped; 

  return escaped; 
}

export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('🎬 Running FFmpeg:\n', args.join(' '));

    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    ff.stderr?.on('data', (d) => {
      const line = d.toString();
      stderr += line;
      console.log('ffmpeg:', line.trim());
    });

    ff.on('close', (code) => {
      if (code === 0) {
        console.log('✅ FFmpeg completed successfully.\n');
        resolve();
      } else {
        reject(new Error(`❌ ffmpeg exited ${code}\nargs: ${args.join(' ')}\nstderr:\n${stderr}`));
      }
    });
  });
}
