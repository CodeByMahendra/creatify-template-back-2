// // src/effects/python-zoom-effect.ts
// import * as path from 'path';
// import * as fs from 'fs';
// import { spawn } from 'child_process';
// import sharp from 'sharp';
// import { escapeFfmpegPath, generateAssWithKaraoke } from './zoom_effect';

// interface Chunk {
//   chunk_id: string;
//   scene_id?: string;
//   text?: string;
//   start_time: number;
//   end_time: number;
//   next_start_time?: number;
//   audio_duration?: number;
//   asset_type?: 'image' | 'video';
//   image_filename?: string;
//   video_filename?: string;
//   start?: number;
//   duration?: number;
//   overlayText?: string;
//   words?: Array<{ word: string; start: number; end: number }>;
//   aspect_ratio?: string;
//   textStyle?: string;
// }

// interface VideoInfo {
//   original_index: number;
//   chunk: Chunk;
//   video_path: string;
//   duration: number;
//   start_time: number;
//   end_time: number;
//   text: string;
//   asset_type: string;
//   start?: number;
//   width?: number;
//   height?: number;
// }

// // ✅ Utility: Run FFmpeg command
// function runFfmpegCommand(args: string[]): Promise<void> {
//   return new Promise((resolve, reject) => {
//     const ffmpeg = spawn('ffmpeg', args);
//     let stderr = '';

//     ffmpeg.stderr.on('data', (data) => {
//       stderr += data.toString();
//     });

//     ffmpeg.on('close', (code) => {
//       if (code === 0) {
//         resolve();
//       } else {
//         reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
//       }
//     });

//     ffmpeg.on('error', (err) => {
//       reject(err);
//     });
//   });
// }

// // ✅ Create Zoom Effect
// async function createZoomEffect(
//   imagePath: string,
//   outputPath: string,
//   width: number,
//   height: number,
//   duration: number,
//   fps: number,
// ): Promise<void> {
//   const direction = Math.random() > 0.5 ? 'in' : 'out';
//   const frameCount = Math.round(duration * fps) + 1;

//   const zoomExprOptions = [
//     `1.2 - (0.2 * sin((on/${frameCount}) * PI/2))`, // ease-out zoom-out
//     `1.0 + (0.2 * sin((on/${frameCount}) * PI/2))`, // ease-in zoom-in
//     `1.1 - 0.1 * cos((on/${frameCount}) * PI)`, // symmetric ease-in-out pulse
//   ];

//   const zExpr = zoomExprOptions[Math.floor(Math.random() * zoomExprOptions.length)];
//   const dExpr = `${duration}*${fps}`;
//   const xExpr = 'iw/2 - (iw/zoom/2)';
//   const yExpr = 'ih/2 - (ih/zoom/2)';
//   const sizeExpr = `${width}x${height}`;

//   const args = [
//     '-y',
//     '-loop', '1',
//     '-framerate', String(fps),
//     '-i', imagePath,
//     '-filter_complex',
//     `scale=8000:-1,zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${dExpr}:s=${sizeExpr}:fps=${fps}`,
//     '-t', String(duration),
//     '-vcodec', 'libx264',
//     '-pix_fmt', 'yuv420p',
//     outputPath,
//   ];

//   await runFfmpegCommand(args);
// }

// // ✅ Create Pan Effect
// async function createPanEffect(
//   imagePath: string,
//   outputPath: string,
//   width: number,
//   height: number,
//   duration: number,
//   fps: number,
// ): Promise<void> {
//   const directions = ['left', 'right', 'top', 'bottom'];
//   const direction = directions[Math.floor(Math.random() * directions.length)];

//   const totalFrames = duration * fps;
//   const sizeExpr = `${width}x${height}`;
//   const baseZoom = 1.2;
//   const zExpr = '1.2';

//   let xExpr: string;
//   let yExpr: string;

//   switch (direction) {
//     case 'left':
//       xExpr = `(1-on/${totalFrames})*(iw - iw/${baseZoom})`;
//       yExpr = `(ih - ih/${baseZoom})/2`;
//       break;
//     case 'right':
//       xExpr = `(on/${totalFrames})*(iw - iw/${baseZoom})`;
//       yExpr = `(ih - ih/${baseZoom})/2`;
//       break;
//     case 'top':
//       xExpr = `(iw - iw/${baseZoom})/2`;
//       yExpr = `(1-on/${totalFrames})*(ih - ih/${baseZoom})`;
//       break;
//     case 'bottom':
//       xExpr = `(iw - iw/${baseZoom})/2`;
//       yExpr = `(on/${totalFrames})*(ih - ih/${baseZoom})`;
//       break;
//     default:
//       throw new Error(`Unsupported pan direction: ${direction}`);
//   }

//   const args = [
//     '-y',
//     '-loop', '1',
//     '-framerate', String(fps),
//     '-t', String(duration),
//     '-i', imagePath,
//     '-filter_complex',
//     `scale=4000:-1,zoompan=x='${xExpr}':y='${yExpr}':z='${zExpr}':d=${totalFrames}:s=${sizeExpr}:fps=${fps}`,
//     '-vcodec', 'libx264',
//     '-pix_fmt', 'yuv420p',
//     '-t', String(duration),
//     outputPath,
//   ];

//   await runFfmpegCommand(args);
// }

// // ✅ Extract video segment using FFmpeg trim
// async function extractVideoSegment(
//   videoPath: string,
//   start: number,
//   duration: number,
//   outputPath: string,
//   width: number,
//   height: number,
// ): Promise<void> {
//   const args = [
//     '-y',
//     '-ss', String(start),
//     '-i', videoPath,
//     '-t', String(duration),
//     '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
//     '-r', '25',
//     '-c:v', 'libx264',
//     '-pix_fmt', 'yuv420p',
//     outputPath,
//   ];

//   await runFfmpegCommand(args);
// }

// // ✅ Process single chunk - generate video
// async function processChunkVideoGeneration(
//   originalIndex: number,
//   chunk: Chunk,
//   imagesFolder: string,
//   width: number,
//   height: number,
//   fps: number,
// ): Promise<VideoInfo | null> {
//   try {
//     const sceneId = chunk.scene_id || '?';
//     const chunkId = chunk.chunk_id || '?';
//     const text = (chunk.text || '').trim().replace(/[.,\s]+$/, '');
//     const startTime = chunk.start_time;
//     // const endTime = chunk.next_start_time;
//     const duration = (chunk.next_start_time ?? chunk.end_time) - chunk.start_time;
// const endTime = chunk.next_start_time ?? chunk.end_time ?? chunk.start_time + duration;


// //    const duration = (chunk.next_start_time ?? chunk.end_time) - chunk.start_time;

//     // const duration = chunk.next_start_time - chunk.start_time;
//     const assetType = chunk.asset_type || 'image';

//     const generatedVideosDir = path.join(imagesFolder, 'generated_videos');
//     if (!fs.existsSync(generatedVideosDir)) {
//       fs.mkdirSync(generatedVideosDir, { recursive: true });
//     }

//     if (assetType === 'image') {
//       const imageFile = chunk.image_filename;
//       if (!imageFile) {
//   console.error(`Image filename is missing for chunk ${chunk.chunk_id}`);
//   return null;
// }
      
//       const imagePath = path.isAbsolute(imageFile)
//         ? imageFile
//         : path.join(imagesFolder, imageFile);

//       if (!fs.existsSync(imagePath)) {
//         console.error(`Image not found: ${imagePath}`);
//         return null;
//       }

//     //   const videoFilename = `${path.parse(imageFile).stem || chunkId}_${duration.toFixed(2)}s.mp4`;
//     const videoFilename = `${path.parse(imageFile).name || chunkId}_${duration.toFixed(2)}s.mp4`;

//     if (!videoFilename) {
//   console.error(`Video filename is missing for chunk ${chunk.chunk_id}`);
//   return null;
// }
//       const videoPath = path.join(generatedVideosDir, videoFilename);

//       // Generate video if not exists
//       if (!fs.existsSync(videoPath)) {
//         const effectChoices = [
//           () => createZoomEffect(imagePath, videoPath, width, height, duration, fps),
//           () => createPanEffect(imagePath, videoPath, width, height, duration, fps),
//         ];

//         const randomEffect = effectChoices[Math.floor(Math.random() * effectChoices.length)];
//         await randomEffect();
//       }

//       return {
//         original_index: originalIndex,
//         chunk,
//         video_path: videoPath,
//         duration,
//         start_time: startTime,
//         end_time: endTime,
//         text,
//         asset_type: assetType,
//       };
//     } else if (assetType === 'video') {
//       const videoFile = chunk.video_filename;
//       if (!videoFile) {
//   console.error(`Video filename is missing for chunk ${chunk.chunk_id}`);
//   return null;
// }
//       const start = chunk.start || 0;
//       const videoPath = path.isAbsolute(videoFile)
//         ? videoFile
//         : path.join(imagesFolder, videoFile);

//       if (!fs.existsSync(videoPath)) {
//         console.error(`Video file not found: ${videoPath}`);
//         return null;
//       }

//       // Extract segment
//       const segmentFilename = `${path.parse(videoFile).name}_segment_${chunkId}.mp4`;
//       const segmentPath = path.join(generatedVideosDir, segmentFilename);

//       if (!fs.existsSync(segmentPath)) {
//         await extractVideoSegment(videoPath, start, duration, segmentPath, width, height);
//       }

//       return {
//         original_index: originalIndex,
//         chunk,
//         video_path: segmentPath,
//         start,
//         width,
//         height,
//         duration,
//         start_time: startTime,
//         end_time: endTime,
//         text,
//         asset_type: assetType,
//       };
//     } else {
//       console.error(`Unknown asset type for chunk ${sceneId}-${chunkId}`);
//       return null;
//     }
//   } catch (error) {
//     console.error(`Error processing chunk at index ${originalIndex}:`, error.message);
//     return null;
//   }
// }

// export async function applyZoomEffectsPython(
//   alignedChunks: Chunk[],
//   imagesFolder: string,
//   width: number,
//   height: number,
//   fps: number = 25,
//   maxWorkers: number = 4,
// ): Promise<string[]> {
//   console.log(`🎬 Starting Python-style zoom effects processing...`);
//   console.log(`📊 Processing ${alignedChunks.length} chunks with ${maxWorkers} workers`);

//   // Calculate total expected duration
//   let totalExpectedDuration = 0;
//   if (alignedChunks.length > 0) {
//     const firstStart = alignedChunks[0].start_time;
//     const lastEnd = alignedChunks[alignedChunks.length - 1].end_time;
//     totalExpectedDuration = lastEnd - firstStart;
//     console.log(`⏱️  Overall duration: ${totalExpectedDuration.toFixed(3)}s`);
//   }

//   // Set next_start_time for each chunk
//   for (let i = 0; i < alignedChunks.length; i++) {
//     if (i === alignedChunks.length - 1) {
//       alignedChunks[i].next_start_time = alignedChunks[i].end_time;
//     } else {
//       alignedChunks[i].next_start_time = alignedChunks[i + 1].start_time;
//     }
//   }

//   // Filter valid chunks
//   const validChunksWithIndex = alignedChunks
//     .map((chunk, index) => ({ index, chunk }))
//     .filter(
//       ({ chunk }) =>
//         chunk.audio_duration !== undefined && chunk.audio_duration > 0,
//     );

//   if (validChunksWithIndex.length === 0) {
//     console.error('❌ No valid chunks to process');
//     return [];
//   }

//   // Phase 1: Generate videos in parallel (batched)
//   console.log(`🎥 Phase 1: Generating ${validChunksWithIndex.length} video clips...`);

//   const videoInfosDict: Record<number, VideoInfo> = {};
//   const batchSize = maxWorkers;

//   for (let i = 0; i < validChunksWithIndex.length; i += batchSize) {
//     const batch = validChunksWithIndex.slice(i, i + batchSize);
//     const batchPromises = batch.map(({ index, chunk }) =>
//       processChunkVideoGeneration(index, chunk, imagesFolder, width, height, fps),
//     );

//     const results = await Promise.all(batchPromises);
//     results.forEach((info) => {
//       if (info) {
//         videoInfosDict[info.original_index] = info;
//       }
//     });

//     console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} complete (${Math.min(i + batchSize, validChunksWithIndex.length)}/${validChunksWithIndex.length})`);
//   }

//   console.log(`✅ Phase 1 complete: Generated ${Object.keys(videoInfosDict).length} videos`);

//   // Phase 2: Return sorted video paths for concatenation
//   const sortedIndices = Object.keys(videoInfosDict)
//     .map(Number)
//     .sort((a, b) => a - b);

//   const clipPaths: string[] = sortedIndices.map((i) => videoInfosDict[i].video_path);

//   console.log(`🎉 Processing complete! Generated ${clipPaths.length} clips`);
//   return clipPaths;
// }

// // ✅ Main export function (following your zoom_effectAd pattern)
// export async function pythonZoomEffectAd(
//   scenes: Chunk[],
//   dirs: any,
//   runFfmpeg: any,
//   fps: number,
//   templates: any,
//   templateName: string = 'python_zoom_effect',
// ): Promise<string[]> {
//   console.log(`🚀 Starting Python Zoom Effect for ${scenes.length} scenes`);

//   // Get dimensions from first scene or default to 16:9
//   const aspectRatio = scenes[0]?.aspect_ratio || '16:9';
//   const { width, height } = getDimensionsFromAspectRatio(aspectRatio);

//   // Use applyZoomEffectsPython to generate clips
//   const clipPaths = await applyZoomEffectsPython(
//     scenes,
//     dirs.imagesDir,
//     width,
//     height,
//     fps,
//     4, // maxWorkers
//   );

//   console.log(`✅ Generated ${clipPaths.length} clips without subtitles`);

//   // Optional: Add subtitles if needed (following your pattern)
//   const finalClipPaths: string[] = [];

//   for (let i = 0; i < clipPaths.length; i++) {
//     const scene = scenes[i];
//     const clipPath = clipPaths[i];

//     if (scene.overlayText && scene.overlayText.trim()) {
//       // Add subtitles using your existing ASS generation
//     //   const { generateAssWithKaraoke, escapeFfmpegPath } = await import('./zoom-pan-effect');
      
//       const assFile = generateAssWithKaraoke(
//         dirs.outputDir,
//         scene.chunk_id,
//         scene.overlayText,
//         scene.start_time || 0,
//         scene.end_time || scene.duration,
//         scene.words || [],
//         templates,
//         templateName,
//         aspectRatio,
//         scene.textStyle || 'Default',
//       );

//       const outputWithSubs = path.join(
//         dirs.outputDir,
//         `final_${scene.chunk_id}_with_subs.mp4`,
//       );

//       const args = [
//         '-y',
//         '-i', clipPath,
//         '-vf', `ass='${escapeFfmpegPath(assFile)}'`,
//         '-c:v', 'libx264',
//         '-pix_fmt', 'yuv420p',
//         outputWithSubs,
//       ];

//       await runFfmpeg(args);
//       finalClipPaths.push(outputWithSubs);
//     } else {
//       finalClipPaths.push(clipPath);
//     }
//   }

//   console.log(`🎬 Final output: ${finalClipPaths.length} clips ready`);
//   return finalClipPaths;
// }

// // ✅ Helper function (from your code)
// function getDimensionsFromAspectRatio(aspectRatio: string) {
//   const ratioMap: Record<string, { width: number; height: number }> = {
//     '16:9': { width: 1920, height: 1080 },
//     '9:16': { width: 1080, height: 1920 },
//     '1:1': { width: 1080, height: 1080 },
//     '4:5': { width: 1080, height: 1350 },
//     '4:3': { width: 1440, height: 1080 },
//   };
//   return ratioMap[aspectRatio] || { width: 1920, height: 1080 };
// }










// import * as path from 'path';
// import * as fs from 'fs';
// import { spawn } from 'child_process';
// import { escapeFfmpegPath, generateAssWithKaraoke } from './zoom_effect';

// interface Chunk {
//   chunk_id: string;
//   scene_id?: string;
//   text?: string;
//   start_time: number;
//   end_time: number;
//   next_start_time?: number;
//   audio_duration?: number;
//   asset_type?: 'image' | 'video';
//   image_filename?: string;
//   video_filename?: string;
//   start?: number;
//   duration?: number;
//   overlayText?: string;
//   words?: Array<{ word: string; start: number; end: number }>;
//   aspect_ratio?: string;
//   textStyle?: string;
//   styleName?: string;  // ✅ Add this
// }
// interface VideoInfo {
//   original_index: number;
//   chunk: Chunk;
//   video_path: string;
//   duration: number;
//   start_time: number;
//   end_time: number;
//   text: string;
//   asset_type: string;
//   start?: number;
//   width?: number;
//   height?: number;
// }

// // ✅ Utility: Run FFmpeg command
// function runFfmpegCommand(args: string[]): Promise<void> {
//   return new Promise((resolve, reject) => {
//     console.log(`🎥 FFmpeg: ${args.join(' ')}`);
//     const ffmpeg = spawn('ffmpeg', args);
//     let stderr = '';

//     ffmpeg.stderr.on('data', (data) => {
//       stderr += data.toString();
//     });

//     ffmpeg.on('close', (code) => {
//       if (code === 0) {
//         resolve();
//       } else {
//         console.error(`❌ FFmpeg failed: ${stderr}`);
//         reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
//       }
//     });

//     ffmpeg.on('error', (err) => {
//       reject(err);
//     });
//   });
// }

// // ✅ Create Zoom Effect
// async function createZoomEffect(
//   imagePath: string,
//   outputPath: string,
//   width: number,
//   height: number,
//   duration: number,
//   fps: number,
// ): Promise<void> {
//   const frameCount = Math.round(duration * fps) + 1;

//   const zoomExprOptions = [
//     `1.2 - (0.2 * sin((on/${frameCount}) * PI/2))`,
//     `1.0 + (0.2 * sin((on/${frameCount}) * PI/2))`,
//     `1.1 - 0.1 * cos((on/${frameCount}) * PI)`,
//   ];

//   const zExpr = zoomExprOptions[Math.floor(Math.random() * zoomExprOptions.length)];
//   const dExpr = `${duration}*${fps}`;
//   const xExpr = 'iw/2 - (iw/zoom/2)';
//   const yExpr = 'ih/2 - (ih/zoom/2)';
//   const sizeExpr = `${width}x${height}`;

//   const args = [
//     '-y',
//     '-loop', '1',
//     '-framerate', String(fps),
//     '-i', imagePath,
//     '-filter_complex',
//     `scale=8000:-1,zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${dExpr}:s=${sizeExpr}:fps=${fps}`,
//     '-t', String(duration),
//     '-vcodec', 'libx264',
//     '-pix_fmt', 'yuv420p',
//     outputPath,
//   ];

//   await runFfmpegCommand(args);
// }

// // ✅ Create Pan Effect
// async function createPanEffect(
//   imagePath: string,
//   outputPath: string,
//   width: number,
//   height: number,
//   duration: number,
//   fps: number,
// ): Promise<void> {
//   const directions = ['left', 'right', 'top', 'bottom'];
//   const direction = directions[Math.floor(Math.random() * directions.length)];

//   const totalFrames = duration * fps;
//   const sizeExpr = `${width}x${height}`;
//   const baseZoom = 1.2;
//   const zExpr = '1.2';

// let xExpr: string = "0";
// let yExpr: string = "0";

//   switch (direction) {
//     case 'left':
//       xExpr = `(1-on/${totalFrames})*(iw - iw/${baseZoom})`;
//       yExpr = `(ih - ih/${baseZoom})/2`;
//       break;
//     case 'right':
//       xExpr = `(on/${totalFrames})*(iw - iw/${baseZoom})`;
//       yExpr = `(ih - ih/${baseZoom})/2`;
//       break;
//     case 'top':
//       xExpr = `(iw - iw/${baseZoom})/2`;
//       yExpr = `(1-on/${totalFrames})*(ih - ih/${baseZoom})`;
//       break;
//     case 'bottom':
//       xExpr = `(iw - iw/${baseZoom})/2`;
//       yExpr = `(on/${totalFrames})*(ih - ih/${baseZoom})`;
//       break;
//   }

//   const args = [
//     '-y',
//     '-loop', '1',
//     '-framerate', String(fps),
//     '-t', String(duration),
//     '-i', imagePath,
//     '-filter_complex',
//     `scale=4000:-1,zoompan=x='${xExpr}':y='${yExpr}':z='${zExpr}':d=${totalFrames}:s=${sizeExpr}:fps=${fps}`,
//     '-vcodec', 'libx264',
//     '-pix_fmt', 'yuv420p',
//     '-t', String(duration),
//     outputPath,
//   ];

//   await runFfmpegCommand(args);
// }

// // ✅ Extract video segment
// async function extractVideoSegment(
//   videoPath: string,
//   start: number,
//   duration: number,
//   outputPath: string,
//   width: number,
//   height: number,
// ): Promise<void> {
//   const args = [
//     '-y',
//     '-ss', String(start),
//     '-i', videoPath,
//     '-t', String(duration),
//     '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
//     '-r', '25',
//     '-c:v', 'libx264',
//     '-pix_fmt', 'yuv420p',
//     outputPath,
//   ];

//   await runFfmpegCommand(args);
// }

// // ✅ Process single chunk
// async function processChunkVideoGeneration(
//   originalIndex: number,
//   chunk: Chunk,
//   imagesFolder: string,
//   width: number,
//   height: number,
//   fps: number,
// ): Promise<VideoInfo | null> {
//   try {
//     const chunkId = chunk.chunk_id || `chunk_${originalIndex}`;
//     const text = (chunk.text || '').trim().replace(/[.,\s]+$/, '');
//     const startTime = chunk.start_time;
    
//     // ✅ Calculate duration safely
//     const duration = chunk.next_start_time 
//       ? chunk.next_start_time - chunk.start_time
//       : chunk.duration || chunk.end_time - chunk.start_time || 1;
    
//     const endTime = chunk.next_start_time ?? chunk.end_time ?? startTime + duration;
//     const assetType = chunk.asset_type || 'image';

//     console.log(`📸 Processing chunk ${chunkId}: duration=${duration.toFixed(2)}s, type=${assetType}`);

//     const generatedVideosDir = path.join(imagesFolder, 'generated_videos');
//     if (!fs.existsSync(generatedVideosDir)) {
//       fs.mkdirSync(generatedVideosDir, { recursive: true });
//     }

//     if (assetType === 'image') {
//       const imageFile = chunk.image_filename;
//       if (!imageFile) {
//         console.error(`❌ Image filename missing for chunk ${chunkId}`);
//         return null;
//       }

//       const imagePath = path.isAbsolute(imageFile)
//         ? imageFile
//         : path.join(imagesFolder, imageFile);

//       if (!fs.existsSync(imagePath)) {
//         console.error(`❌ Image not found: ${imagePath}`);
//         return null;
//       }

//       const videoFilename = `${path.parse(imageFile).name}_${duration.toFixed(2)}s.mp4`;
//       const videoPath = path.join(generatedVideosDir, videoFilename);

//       // Generate video if not exists
//       if (!fs.existsSync(videoPath)) {
//         console.log(`🎨 Creating video: ${videoFilename}`);
//         const effectChoices = [
//           () => createZoomEffect(imagePath, videoPath, width, height, duration, fps),
//           () => createPanEffect(imagePath, videoPath, width, height, duration, fps),
//         ];

//         const randomEffect = effectChoices[Math.floor(Math.random() * effectChoices.length)];
//         await randomEffect();
//         console.log(`✅ Video created: ${videoPath}`);
//       } else {
//         console.log(`♻️  Using existing video: ${videoFilename}`);
//       }

//       return {
//         original_index: originalIndex,
//         chunk,
//         video_path: videoPath,
//         duration,
//         start_time: startTime,
//         end_time: endTime,
//         text,
//         asset_type: assetType,
//       };
//     } else if (assetType === 'video') {
//       const videoFile = chunk.video_filename;
//       if (!videoFile) {
//         console.error(`❌ Video filename missing for chunk ${chunkId}`);
//         return null;
//       }

//       const start = chunk.start || 0;
//       const videoPath = path.isAbsolute(videoFile)
//         ? videoFile
//         : path.join(imagesFolder, videoFile);

//       if (!fs.existsSync(videoPath)) {
//         console.error(`❌ Video not found: ${videoPath}`);
//         return null;
//       }

//       const segmentFilename = `${path.parse(videoFile).name}_segment_${chunkId}.mp4`;
//       const segmentPath = path.join(generatedVideosDir, segmentFilename);

//       if (!fs.existsSync(segmentPath)) {
//         console.log(`✂️  Extracting segment: ${segmentFilename}`);
//         await extractVideoSegment(videoPath, start, duration, segmentPath, width, height);
//         console.log(`✅ Segment created: ${segmentPath}`);
//       } else {
//         console.log(`♻️  Using existing segment: ${segmentFilename}`);
//       }

//       return {
//         original_index: originalIndex,
//         chunk,
//         video_path: segmentPath,
//         start,
//         width,
//         height,
//         duration,
//         start_time: startTime,
//         end_time: endTime,
//         text,
//         asset_type: assetType,
//       };
//     }

//     return null;
//   } catch (error) {
//     console.error(`❌ Error processing chunk ${originalIndex}:`, error.message);
//     return null;
//   }
// }

// // ✅ Main processing function
// export async function applyZoomEffectsPython(
//   alignedChunks: Chunk[],
//   imagesFolder: string,
//   width: number,
//   height: number,
//   fps: number = 25,
//   maxWorkers: number = 4,
// ): Promise<string[]> {
//   console.log(`🎬 Starting Python-style processing...`);
//   console.log(`📊 Chunks: ${alignedChunks.length}, Workers: ${maxWorkers}`);

//   // Set next_start_time
//   for (let i = 0; i < alignedChunks.length; i++) {
//     if (i === alignedChunks.length - 1) {
//       alignedChunks[i].next_start_time = alignedChunks[i].end_time;
//     } else {
//       alignedChunks[i].next_start_time = alignedChunks[i + 1].start_time;
//     }
//   }

//   // ✅ Filter valid chunks (must have audio_duration > 0)
//   const validChunksWithIndex = alignedChunks
//     .map((chunk, index) => ({ index, chunk }))
//     .filter(({ chunk }) => {
//       const isValid = chunk.audio_duration !== undefined && chunk.audio_duration > 0;
//       if (!isValid) {
//         console.warn(`⚠️ Skipping chunk ${chunk.chunk_id}: audio_duration=${chunk.audio_duration}`);
//       }
//       return isValid;
//     });

//   if (validChunksWithIndex.length === 0) {
//     console.error('❌ No valid chunks (all have audio_duration <= 0)');
//     return [];
//   }

//   console.log(`✅ Valid chunks: ${validChunksWithIndex.length}/${alignedChunks.length}`);

//   // Phase 1: Generate videos in batches
//   console.log(`🎥 Phase 1: Generating videos...`);

//   const videoInfosDict: Record<number, VideoInfo> = {};
//   const batchSize = maxWorkers;

//   for (let i = 0; i < validChunksWithIndex.length; i += batchSize) {
//     const batch = validChunksWithIndex.slice(i, i + batchSize);
//     const batchPromises = batch.map(({ index, chunk }) =>
//       processChunkVideoGeneration(index, chunk, imagesFolder, width, height, fps),
//     );

//     const results = await Promise.all(batchPromises);
//     results.forEach((info) => {
//       if (info) {
//         videoInfosDict[info.original_index] = info;
//       }
//     });

//     console.log(`✅ Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(validChunksWithIndex.length / batchSize)} complete`);
//   }

//   // Phase 2: Return sorted paths
//   const sortedIndices = Object.keys(videoInfosDict)
//     .map(Number)
//     .sort((a, b) => a - b);

//   const clipPaths: string[] = sortedIndices.map((i) => videoInfosDict[i].video_path);

//   console.log(`🎉 Generated ${clipPaths.length} clips`);
//   return clipPaths;
// }

// // ✅ Main export (with subtitle support)
// export async function pythonZoomEffectAd(
//   scenes: Chunk[],
//   dirs: any,
//   runFfmpeg: any,
//   fps: number,
//   templates: any,
//   templateName: string = 'zoom_effect',
// ): Promise<string[]> {
//   console.log(`🚀 pythonZoomEffectAd: ${scenes.length} scenes`);

//   const aspectRatio = scenes[0]?.aspect_ratio || '16:9';
//   const { width, height } = getDimensionsFromAspectRatio(aspectRatio);

//   // Generate base clips
//   const clipPaths = await applyZoomEffectsPython(
//     scenes,
//     dirs.imagesDir,
//     width,
//     height,
//     fps,
//     4,
//   );

//   if (clipPaths.length === 0) {
//     console.error('❌ No clips generated');
//     return [];
//   }

//   console.log(`✅ Base clips generated: ${clipPaths.length}`);

//   // Add subtitles if needed
//   const finalClipPaths: string[] = [];

//   for (let i = 0; i < clipPaths.length; i++) {
//     const scene = scenes[i];
//     const clipPath = clipPaths[i];

//     if (scene?.overlayText?.trim()) {
//       try {
//        const assFile = generateAssWithKaraoke(
//   dirs.outputDir,
//   scene.chunk_id,
//   scene.overlayText,
//   scene.start_time || 0,
//   scene.end_time || 1,
//   scene.words || [],
//   templates,
//   templateName,
//   aspectRatio,
//   scene.styleName || 'Default'  // ✅ 10th argument
// );

//         const outputWithSubs = path.join(
//           dirs.outputDir,
//           `final_${scene.chunk_id}_subs.mp4`,
//         );

//         await runFfmpeg([
//           '-y',
//           '-i', clipPath,
//           '-vf', `ass='${escapeFfmpegPath(assFile)}'`,
//           '-c:v', 'libx264',
//           '-pix_fmt', 'yuv420p',
//           outputWithSubs,
//         ]);

//         finalClipPaths.push(outputWithSubs);
//         console.log(`✅ Added subtitles: ${scene.chunk_id}`);
//       } catch (error) {
//         console.error(`❌ Subtitle error for ${scene.chunk_id}:`, error.message);
//         finalClipPaths.push(clipPath);
//       }
//     } else {
//       finalClipPaths.push(clipPath);
//     }
//   }

//   console.log(`🎬 Final: ${finalClipPaths.length} clips`);
//   return finalClipPaths;
// }

// function getDimensionsFromAspectRatio(aspectRatio: string) {
//   const ratioMap: Record<string, { width: number; height: number }> = {
//     '16:9': { width: 1920, height: 1080 },
//     '9:16': { width: 1080, height: 1920 },
//     '1:1': { width: 1080, height: 1080 },
//     '4:5': { width: 1080, height: 1350 },
//     '4:3': { width: 1440, height: 1080 },
//   };
//   return ratioMap[aspectRatio] || { width: 1920, height: 1080 };
// }


















// // video-effects.service.ts
// import { Injectable, Logger } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import * as ffmpeg from 'fluent-ffmpeg';
// import * as path from 'path';
// import * as fs from 'fs/promises';
// import { createWriteStream } from 'fs';
// import * as cv from '@u4/opencv4nodejs';

// interface Chunk {
//   scene_id?: string;
//   chunk_id?: string;
//   text: string;
//   start_time: number;
//   end_time: number;
//   next_start_time?: number;
//   audio_duration?: number;
//   asset_type?: 'image' | 'video';
//   image_filename?: string;
//   video_filename?: string;
//   start?: number;
// }

// interface VideoInfo {
//   original_index: number;
//   chunk: Chunk;
//   video_path: string;
//   duration: number;
//   start_time: number;
//   end_time: number;
//   text: string;
//   asset_type: string;
//   start?: number;
//   width?: number;
//   height?: number;
// }

// @Injectable()
// export class VideoEffectsService {
//   private readonly logger = new Logger(VideoEffectsService.name);
//   private readonly maxWorkers: number;
//   private readonly fps: number;

//   constructor(private configService: ConfigService) {
//     this.maxWorkers = this.configService.get<number>('MAX_WORKER', 4);
//     this.fps = this.configService.get<number>('FPS', 30);
//   }

//   /**
//    * Creates a smooth zoom effect video from a static image
//    */
//   async createZoomEffect(
//     imagePath: string,
//     outputPath: string,
//     width: number,
//     height: number,
//     duration: number = 2,
//   ): Promise<void> {
//     const direction = Math.random() > 0.5 ? 'in' : 'out';
//     const frameCount = Math.round(duration * this.fps) + 1;

//     const zoomExprOptions = [
//       `1.2 - (0.2 * sin((on/${frameCount}) * PI/2))`, // ease-out zoom-out
//       `1.0 + (0.2 * sin((on/${frameCount}) * PI/2))`, // ease-in zoom-in
//       `1.1 - 0.1 * cos((on/${frameCount}) * PI)`, // symmetric ease-in-out pulse
//     ];

//     const zExpr = zoomExprOptions[Math.floor(Math.random() * zoomExprOptions.length)];
//     const dExpr = `${duration}*${this.fps}`;
//     const xExpr = 'iw/2 - (iw/zoom/2)';
//     const yExpr = 'ih/2 - (ih/zoom/2)';
//     const sizeExpr = `${width}x${height}`;

//     return new Promise((resolve, reject) => {
//       ffmpeg(imagePath)
//         .inputOptions(['-loop 1', `-framerate ${this.fps}`])
//         .complexFilter([
//           `scale=8000:-1`,
//           `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${dExpr}:s=${sizeExpr}:fps=${this.fps}`,
//         ])
//         .outputOptions([
//           `-t ${duration}`,
//           '-vcodec libx264',
//           '-pix_fmt yuv420p',
//           '-y',
//         ])
//         .output(outputPath)
//         .on('end', () => {
//           this.logger.debug(`Zoom effect created: ${outputPath}`);
//           resolve();
//         })
//         .on('error', (err) => {
//           this.logger.error(`Error creating zoom effect: ${err.message}`);
//           reject(err);
//         })
//         .run();
//     });
//   }

//   /**
//    * Creates a pan effect video from a static image
//    */
//   async createPanEffect(
//     imagePath: string,
//     outputPath: string,
//     width: number,
//     height: number,
//     duration: number = 4,
//   ): Promise<void> {
//     const directions = ['left', 'right', 'top', 'bottom'];
//     const direction = directions[Math.floor(Math.random() * directions.length)];

//     const totalFrames = duration * this.fps;
//     const sizeExpr = `${width}x${height}`;
//     const baseZoom = 1.2;
//     const zExpr = '1.2';

//     let xExpr: string;
//     let yExpr: string;

//     switch (direction) {
//       case 'left':
//         xExpr = `(1-on/${totalFrames})*(iw - iw/${baseZoom})`;
//         yExpr = `(ih - ih/${baseZoom})/2`;
//         break;
//       case 'right':
//         xExpr = `(on/${totalFrames})*(iw - iw/${baseZoom})`;
//         yExpr = `(ih - ih/${baseZoom})/2`;
//         break;
//       case 'top':
//         xExpr = `(iw - iw/${baseZoom})/2`;
//         yExpr = `(1-on/${totalFrames})*(ih - ih/${baseZoom})`;
//         break;
//       case 'bottom':
//         xExpr = `(iw - iw/${baseZoom})/2`;
//         yExpr = `(on/${totalFrames})*(ih - ih/${baseZoom})`;
//         break;
//       default:
//         throw new Error(`Unsupported pan direction: ${direction}`);
//     }

//     return new Promise((resolve, reject) => {
//       ffmpeg(imagePath)
//         .inputOptions(['-loop 1', `-framerate ${this.fps}`, `-t ${duration}`])
//         .complexFilter([
//           `scale=4000:-1`,
//           `zoompan=x='${xExpr}':y='${yExpr}':z='${zExpr}':d=${totalFrames}:s=${sizeExpr}:fps=${this.fps}`,
//         ])
//         .outputOptions([
//           '-vcodec libx264',
//           '-pix_fmt yuv420p',
//           `-t ${duration}`,
//           '-y',
//         ])
//         .output(outputPath)
//         .on('end', () => {
//           this.logger.debug(`Pan effect created: ${outputPath} (direction: ${direction})`);
//           resolve();
//         })
//         .on('error', (err) => {
//           this.logger.error(`Error creating pan effect: ${err.message}`);
//           reject(err);
//         })
//         .run();
//     });
//   }

//   /**
//    * Extract frames from a video segment
//    */
//   async extractVideoFrames(
//     videoPath: string,
//     start: number,
//     width: number,
//     height: number,
//     duration: number,
//   ): Promise<cv.Mat[]> {
//     const cap = new cv.VideoCapture(videoPath);
//     cap.set(cv.CAP_PROP_POS_MSEC, start * 1000);

//     const numFrames = Math.round(duration * this.fps) + 1;
//     const frames: cv.Mat[] = [];

//     for (let i = 0; i < numFrames; i++) {
//       const frame = cap.read();
//       if (frame.empty) {
//         break;
//       }
//       const resized = frame.resize(height, width);
//       frames.push(resized);
//     }

//     cap.release();

//     // Pad if needed
//     if (frames.length < numFrames) {
//       if (frames.length > 0) {
//         const lastFrame = frames[frames.length - 1];
//         const framesToAdd = numFrames - frames.length;
//         for (let i = 0; i < framesToAdd; i++) {
//           frames.push(lastFrame.copy());
//         }
//       } else {
//         // Create black frames
//         const blackFrame = new cv.Mat(height, width, cv.CV_8UC3, [0, 0, 0]);
//         for (let i = 0; i < numFrames; i++) {
//           frames.push(blackFrame.copy());
//         }
//       }
//     }

//     return frames;
//   }

//   /**
//    * Process a single chunk for video generation
//    */
//   async processChunkVideoGeneration(
//     originalIndex: number,
//     chunk: Chunk,
//     imagesFolder: string,
//     width: number,
//     height: number,
//   ): Promise<VideoInfo | null> {
//     try {
//       const sceneId = chunk.scene_id || '?';
//       const chunkId = chunk.chunk_id || '?';
//       const text = chunk.text.trim().replace(/[.,\s]+$/, '');
//       const startTime = chunk.start_time;
//       const endTime = chunk.next_start_time;
//       const duration = chunk.next_start_time - chunk.start_time;
//       const assetType = chunk.asset_type || 'image';

//       const generatedVideosDir = path.join(imagesFolder, 'generated_videos');
//       await fs.mkdir(generatedVideosDir, { recursive: true });

//       if (assetType === 'image') {
//         const imageFile = chunk.image_filename;
//         const imagePath = path.join(imagesFolder, imageFile);
//         const videoFilename = `${path.parse(imageFile).name}_${duration.toFixed(2)}s.mp4`;
//         const videoPath = path.join(generatedVideosDir, videoFilename);

//         // Generate video segment if it doesn't exist
//         try {
//           await fs.access(videoPath);
//         } catch {
//           // File doesn't exist, generate it
//           const effectChoices = [
//             () => this.createZoomEffect(imagePath, videoPath, width, height, duration),
//             () => this.createPanEffect(imagePath, videoPath, width, height, duration),
//           ];

//           const randomEffect = effectChoices[Math.floor(Math.random() * effectChoices.length)];
//           await randomEffect();
//         }

//         return {
//           original_index: originalIndex,
//           chunk,
//           video_path: videoPath,
//           duration,
//           start_time: startTime,
//           end_time: endTime,
//           text,
//           asset_type: assetType,
//         };
//       } else if (assetType === 'video') {
//         const videoFile = chunk.video_filename;
//         const start = chunk.start;
//         const videoPath = path.join(imagesFolder, videoFile);

//         // Verify video file exists
//         try {
//           await fs.access(videoPath);
//         } catch {
//           this.logger.error(`Video file not found: ${videoPath}`);
//           return null;
//         }

//         return {
//           original_index: originalIndex,
//           chunk,
//           video_path: videoPath,
//           start,
//           width,
//           height,
//           duration,
//           start_time: startTime,
//           end_time: endTime,
//           text,
//           asset_type: assetType,
//         };
//       } else {
//         this.logger.error(`Unknown asset type for chunk ${sceneId}-${chunkId}, skipping.`);
//         return null;
//       }
//     } catch (error) {
//       this.logger.error(`Error processing chunk at index ${originalIndex}: ${error.message}`);
//       return null;
//     }
//   }

//   /**
//    * Process frames from a generated video
//    */
//   async processVideoFrames(videoInfo: VideoInfo): Promise<cv.Mat[]> {
//     try {
//       const { chunk, video_path, duration, asset_type } = videoInfo;
//       const frames: cv.Mat[] = [];

//       if (asset_type === 'image') {
//         const cap = new cv.VideoCapture(video_path);
//         if (!cap.isOpened()) {
//           this.logger.error(`Could not open video ${video_path}`);
//           return frames;
//         }

//         const framesNeeded = Math.round(duration * this.fps);
//         let framesRead = 0;

//         try {
//           while (framesRead <= framesNeeded) {
//             const frame = cap.read();
//             if (frame.empty) {
//               break;
//             }
//             frames.push(frame);
//             framesRead++;
//           }
//         } finally {
//           cap.release();
//         }

//         return frames;
//       } else if (asset_type === 'video') {
//         const { start, width, height } = videoInfo;
//         return await this.extractVideoFrames(video_path, start, width, height, duration);
//       }

//       return frames;
//     } catch (error) {
//       this.logger.error(`Error processing video frames: ${error.message}`);
//       return [];
//     }
//   }

//   /**
//    * Apply zoom effects with threading
//    */
//   async *applyZoomEffects(
//     alignedChunks: Chunk[],
//     imagesFolder: string,
//     width: number,
//     height: number,
//   ): AsyncGenerator<cv.Mat, void, unknown> {
//     // Calculate total expected duration and frames
//     let totalExpectedDuration = 0;
//     let totalExpectedFrames = 0;

//     if (alignedChunks.length > 0) {
//       const firstStart = alignedChunks[0].start_time;
//       const lastEnd = alignedChunks[alignedChunks.length - 1].end_time;
//       totalExpectedDuration = lastEnd - firstStart;
//       totalExpectedFrames = Math.floor(totalExpectedDuration * this.fps);
//       this.logger.debug(`Overall duration: ${totalExpectedDuration.toFixed(3)}s`);
//       this.logger.debug(`Expected total frames: ${totalExpectedFrames}`);
//     }

//     this.logger.log(`Starting multi-threaded processing with ${this.maxWorkers} workers`);

//     // Set next_start_time for each chunk
//     for (let i = 0; i < alignedChunks.length; i++) {
//       if (i === alignedChunks.length - 1) {
//         alignedChunks[i].next_start_time = alignedChunks[i].end_time;
//       } else {
//         alignedChunks[i].next_start_time = alignedChunks[i + 1].start_time;
//       }
//     }

//     // Filter valid chunks
//     const validChunksWithIndex = alignedChunks
//       .map((chunk, index) => ({ index, chunk }))
//       .filter(({ chunk }) => chunk.audio_duration !== undefined && chunk.audio_duration > 0);

//     if (validChunksWithIndex.length === 0) {
//       this.logger.error('No valid chunks to process');
//       return;
//     }

//     // Phase 1: Generate videos in parallel
//     this.logger.debug('Phase 1: Generating videos...');
    
//     const videoGenerationPromises = validChunksWithIndex.map(({ index, chunk }) =>
//       this.processChunkVideoGeneration(index, chunk, imagesFolder, width, height),
//     );

//     const videoInfosArray = await Promise.all(videoGenerationPromises);
//     const videoInfosDict: Record<number, VideoInfo> = {};

//     videoInfosArray.forEach((info) => {
//       if (info) {
//         videoInfosDict[info.original_index] = info;
//       }
//     });

//     this.logger.debug(`Phase 1 complete: Generated ${Object.keys(videoInfosDict).length} videos`);

//     // Phase 2: Process frames in parallel
//     this.logger.debug('Phase 2: Processing frames...');

//     const sortedVideoInfos = Object.keys(videoInfosDict)
//       .map(Number)
//       .sort((a, b) => a - b)
//       .map((i) => videoInfosDict[i]);

//     const frameProcessingPromises = sortedVideoInfos.map((info) =>
//       this.processVideoFrames(info),
//     );

//     const framesArrays = await Promise.all(frameProcessingPromises);
//     const framesDict: Record<number, cv.Mat[]> = {};

//     sortedVideoInfos.forEach((info, idx) => {
//       framesDict[info.original_index] = framesArrays[idx];
//     });

//     // Phase 3: Yield frames in correct order
//     this.logger.debug('Phase 3: Yielding frames in correct order...');

//     const allFrames: cv.Mat[] = [];
//     let totalFramesYielded = 0;

//     const sortedIndices = Object.keys(framesDict).map(Number).sort((a, b) => a - b);

//     for (const i of sortedIndices) {
//       const frames = framesDict[i];
//       const chunkInfo = validChunksWithIndex.find(({ index }) => index === i);

//       if (chunkInfo) {
//         const duration = chunkInfo.chunk.next_start_time - chunkInfo.chunk.start_time;
//         const expectedFrames = Math.floor(duration * this.fps);
//         let yieldedCount = 0;
//         let lastFrame: cv.Mat;

//         if (frames && frames.length > 0) {
//           for (let j = 0; j < expectedFrames; j++) {
//             if (j < frames.length) {
//               allFrames.push(frames[j]);
//               lastFrame = frames[j];
//             } else {
//               allFrames.push(lastFrame.copy());
//             }
//             yieldedCount++;
//           }
//         } else {
//           this.logger.warn(`No frames available for chunk at index ${i}`);
//           const blackFrame = new cv.Mat(height, width, cv.CV_8UC3, [0, 0, 0]);
//           for (let j = 0; j < expectedFrames; j++) {
//             allFrames.push(blackFrame.copy());
//             lastFrame = blackFrame;
//             yieldedCount++;
//           }
//         }

//         totalFramesYielded += yieldedCount;
//         this.logger.debug(`Chunk ${i}: expected=${expectedFrames}, yielded=${yieldedCount}`);
//       } else {
//         for (const frame of frames) {
//           allFrames.push(frame);
//           totalFramesYielded++;
//         }
//       }
//     }

//     // Adjust frame count to match expected total
//     if (totalFramesYielded !== totalExpectedFrames) {
//       const frameDiff = totalExpectedFrames - totalFramesYielded;
//       this.logger.warn(
//         `Frame count mismatch: expected=${totalExpectedFrames}, yielded=${totalFramesYielded}, diff=${frameDiff}`,
//       );

//       if (frameDiff > 0) {
//         if (allFrames.length > 0) {
//           const lastValidFrame = allFrames[allFrames.length - 1];
//           this.logger.debug(`Adding ${frameDiff} frames by duplicating last frame`);
//           for (let i = 0; i < frameDiff; i++) {
//             allFrames.push(lastValidFrame.copy());
//           }
//         } else {
//           const blackFrame = new cv.Mat(height, width, cv.CV_8UC3, [0, 0, 0]);
//           this.logger.debug(`Adding ${frameDiff} black frames`);
//           for (let i = 0; i < frameDiff; i++) {
//             allFrames.push(blackFrame.copy());
//           }
//         }
//       } else {
//         const framesToRemove = Math.abs(frameDiff);
//         this.logger.debug(`Removing ${framesToRemove} excess frames from end`);
//         allFrames.splice(totalExpectedFrames);
//       }

//       totalFramesYielded = allFrames.length;
//       this.logger.debug(`Adjusted frame count: ${totalFramesYielded}`);
//     }

//     // Yield all frames
//     for (const frame of allFrames) {
//       yield frame;
//     }

//     this.logger.log('Multi-threaded processing complete!');
//     this.logger.log(`Yielded ${totalFramesYielded} total frames (expected: ${totalExpectedFrames})`);
//   }
// }