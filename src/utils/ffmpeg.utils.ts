import { spawn } from 'child_process';

export function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ff.stderr?.on('data', (d) => (stderr += d.toString()));
    ff.on('close', (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `❌ ffmpeg exited ${code}\nargs: ${args.join(' ')}\nstderr:\n${stderr}`,
          ),
        );
    });
  });
}
