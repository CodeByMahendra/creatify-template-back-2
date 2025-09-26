
import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

@Injectable()
export class VideoService {
assetsDir = path.join(process.cwd(), 'assets');
imagesDir = path.join(this.assetsDir, 'images');
outputDir = path.join(this.assetsDir, 'output');
width = 1280;
height = 720;
fps = 25;


async buildVideo(scenes: { chunk_id: string; image_filename: string; duration: number; direction?: string; overlayText?: string; }[]) {
if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });


const clipPaths: string[] = [];


for (let i = 0; i < scenes.length; i++) {
const scene = scenes[i];
const { chunk_id, image_filename, duration, direction, overlayText } = scene;
const inputPath = path.join(this.imagesDir, image_filename);
if (!fs.existsSync(inputPath)) throw new Error(`Image not found: ${inputPath}`);


const clipPath = path.join(this.outputDir, `clip_${chunk_id}.mp4`);
clipPaths.push(clipPath);


const scaleW = Math.round(this.width * 1.25);
const scaleH = Math.round(this.height * 1.25);


let exprX = '0';
let exprY = '0';
const moveDir = direction || (i % 2 === 0 ? 'left' : 'bottom');


if (moveDir === 'left') exprX = `(in_w-out_w)*t/${duration}`;
if (moveDir === 'right') exprX = `(in_w-out_w)*(1 - t/${duration})`;
if (moveDir === 'top') exprY = `(in_h-out_h)*t/${duration}`;
if (moveDir === 'bottom') exprY = `(in_h-out_h)*(1 - t/${duration})`;


let filter = `scale=${scaleW}:${scaleH},crop=${this.width}:${this.height}:x='${exprX}':y='${exprY}'`;
filter += `,format=yuv420p`;
filter += `,drawbox=x=50:y=(${this.height}-100):w=${this.width-100}:h=60:color=black@0.45:t=fill`;


if (overlayText) {
const fontFile = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
? ":fontfile='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'"
: ":font='Arial'";
filter += `,drawtext=text='${overlayText}':x=70:y=(${this.height}-60):fontsize=26:fontcolor=white${fontFile}`;
}


const args = [
'-y', '-loop', '1', '-i', inputPath,
'-vf', filter,
'-r', String(this.fps), '-t', String(duration),
'-pix_fmt', 'yuv420p',
clipPath,
];


await this.runFfmpeg(args);
}


const listFile = path.join(this.outputDir, 'concat_list.txt');
const listContent = clipPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
fs.writeFileSync(listFile, listContent);


const finalPath = path.join(this.outputDir, 'final_output.mp4');
await this.runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', finalPath]);


return { clips: clipPaths, final: finalPath };
}


runFfmpeg(args: string[]) {
return new Promise<void>((resolve, reject) => {
const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
ff.stderr?.on('data', d => (stderr += d.toString()));
ff.on('close', code => {
if (code === 0) resolve();
else reject(new Error(`ffmpeg exited ${code}\nargs: ${args.join(' ')}\nstderr:\n${stderr}`));
});
});
}
}






// import { Injectable } from '@nestjs/common';
// import { spawn } from 'child_process';
// import * as fs from 'fs';
// import * as path from 'path';


// @Injectable()
// export class VideoService {
// assetsDir = path.join(process.cwd(), 'assets');
// imagesDir = path.join(this.assetsDir, 'images');
// outputDir = path.join(this.assetsDir, 'output');
// width = 1280;
// height = 720;
// fps = 25;


// async buildVideo(scenes: { chunk_id: string; image_filename: string; duration: number }[]) {
// // ensure output dir exists
// if (!fs.existsSync(this.outputDir)) fs.mkdirSync(this.outputDir, { recursive: true });


// const clipPaths: string[] = [];


// for (const scene of scenes) {
// const { chunk_id, image_filename, duration } = scene;
// const inputPath = path.join(this.imagesDir, image_filename);
// if (!fs.existsSync(inputPath)) throw new Error(`Image not found: ${inputPath}`);


// const clipPath = path.join(this.outputDir, `clip_${chunk_id}.mp4`);
// clipPaths.push(clipPath);


// // Build ffmpeg arguments to create pan/move clip
// // Strategy: scale image larger than output then crop window of output size whose x moves linearly with time


// const scaleW = Math.round(this.width * 1.25); // make image slightly larger
// const scaleH = Math.round(this.height * 1.25);


// // x expression: move from 0 -> (in_w-out_w) over duration seconds
// // Using filter expression string with duration number substituted
// const vf = `scale=${scaleW}:${scaleH},crop=${this.width}:${this.height}:x='(in_w-out_w)*t/${duration}':y=0,format=yuv420p`;


// const args = [
// '-y',
// '-loop', '1',
// '-i', inputPath,
// '-vf', vf,
// '-r', String(this.fps),
// '-t', String(duration),
// '-pix_fmt', 'yuv420p',
// clipPath,
// ];


// await this.runFfmpeg(args);
// }


// // create concat list
// const listFile = path.join(this.outputDir, 'concat_list.txt');
// const listContent = clipPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
// fs.writeFileSync(listFile, listContent);


// // final output
// const finalPath = path.join(this.outputDir, 'final_output.mp4');


// // Use concat demuxer (fast) — ensures identical codecs & formats
// await this.runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', finalPath]);


// return {
// clips: clipPaths,
// final: finalPath,
// };
// }


// runFfmpeg(args: string[]) {
// return new Promise<void>((resolve, reject) => {
// const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
// let stdout = '';
// let stderr = '';
// ff.stdout?.on('data', d => (stdout += d.toString()));
// ff.stderr?.on('data', d => (stderr += d.toString()));
// ff.on('close', code => {
// if (code === 0) resolve();
// else reject(new Error(`ffmpeg exited ${code}\nargs: ${args.join(' ')}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
// });
// });
// }
// }