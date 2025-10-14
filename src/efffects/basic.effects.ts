// import * as path from 'path';
// import * as fs from 'fs';
// import sharp from 'sharp';
// import ffmpeg from 'fluent-ffmpeg';
// import * as Bluebird from 'bluebird';

// // Interface definitions
// interface Chunk {
//   scene_id: number;
//   chunk_id: number;
//   start_time: number;
//   end_time: number;
//   next_start_time?: number;
//   text: string;
//   audio_duration?: number;
//   asset_type?: 'image' | 'video';
//   image_filename?: string;
//   video_filename?: string;
//   start?: number;
// }

// interface Dirs {
//   imagesDir: string;
//   videosDir: string;
//   outputDir: string;
// }


// const imagesDir = path.join(__dirname, 'downloaded_images'); // <-- your folder


// function createBlackFrame(width: number, height: number): Buffer {
//   return Buffer.alloc(width * height * 3);
// }

// async function loadAndResizeImage(
//   imagePath: string,
//   width: number,
//   height: number,
// ): Promise<Buffer> {
//   try {
//     if (!fs.existsSync(imagePath)) {
//       console.error(`Warning: Could not load image ${imagePath}, using black placeholder`);
//       return createBlackFrame(width, height);
//     }

//     const metadata = await sharp(imagePath).metadata();
//     const imgWidth = metadata.width || width;
//     const imgHeight = metadata.height || height;

//     const scale = Math.min(width / imgWidth, height / imgHeight);
//     const newWidth = Math.round(imgWidth * scale);
//     const newHeight = Math.round(imgHeight * scale);

//     const resizedImage = await sharp(imagePath)
//       .resize(newWidth, newHeight, {
//         fit: 'contain',
//         background: { r: 0, g: 0, b: 0, alpha: 1 },
//       })
//       .raw()
//       .toBuffer();

//     const background = Buffer.alloc(width * height * 3);
//     const yOffset = Math.floor((height - newHeight) / 2);
//     const xOffset = Math.floor((width - newWidth) / 2);

//     for (let y = 0; y < newHeight; y++) {
//       for (let x = 0; x < newWidth; x++) {
//         const srcIdx = (y * newWidth + x) * 3;
//         const destIdx = ((y + yOffset) * width + (x + xOffset)) * 3;
//         background[destIdx] = resizedImage[srcIdx];
//         background[destIdx + 1] = resizedImage[srcIdx + 1];
//         background[destIdx + 2] = resizedImage[srcIdx + 2];
//       }
//     }

//     return background;
//   } catch (error) {
//     console.error(`Error resizing image ${imagePath}: ${error.message}`);
//     return createBlackFrame(width, height);
//   }
// }


// async function extractVideoFrames(
//   videoPath: string,
//   startTime: number,
//   duration: number,
//   width: number,
//   height: number,
//   fps: number,
// ): Promise<Buffer[]> {
//   return new Promise((resolve, reject) => {
//     const frames: Buffer[] = [];
//     const framesNeeded = Math.round(duration * fps);
//     let framesRead = 0;

//     ffmpeg(videoPath)
//       .seekInput(startTime)
//       .duration(duration)
//       .fps(fps)
//       .size(`${width}x${height}`)
//       .outputFormat('rawvideo')
//       .outputOptions('-pix_fmt rgb24')
//       .on('error', (err) => {
//         console.error(`Error extracting video frames: ${err.message}`);
//         reject(err);
//       })
//       .on('end', () => {
//         if (frames.length < framesNeeded && frames.length > 0) {
//           const lastFrame = frames[frames.length - 1];
//           const framesToAdd = framesNeeded - frames.length;
//           for (let i = 0; i < framesToAdd; i++) {
//             frames.push(Buffer.from(lastFrame));
//           }
//         } else if (frames.length === 0) {
//           const blackFrame = createBlackFrame(width, height);
//           for (let i = 0; i < framesNeeded; i++) {
//             frames.push(Buffer.from(blackFrame));
//           }
//         }
//         resolve(frames);
//       })
//       .pipe()
//       .on('data', (chunk: Buffer) => {
//         if (framesRead < framesNeeded) {
//           frames.push(chunk);
//           framesRead++;
//         }
//       });
//   });
// }

// /**
//  * Process a single chunk to generate frames
//  */
// async function processChunkFrames(
//   chunk: Chunk,
//   imagesFolder: string,
//   width: number,
//   height: number,
//   fps: number,
// ): Promise<{ sceneId: number; chunkId: number; frames: Buffer[] }> {
//   try {
//     if (!chunk.audio_duration || chunk.audio_duration <= 0) {
//       console.warn(`Skipping chunk ${chunk.scene_id}-${chunk.chunk_id} - no valid duration`);
//       return { sceneId: chunk.scene_id, chunkId: chunk.chunk_id, frames: [] };
//     }

//     const { scene_id, chunk_id } = chunk;
//     const duration = (chunk.next_start_time ?? chunk.end_time) - chunk.start_time;
//     const assetType = chunk.asset_type || 'image';

//     const frames: Buffer[] = [];

//     if (assetType === 'image') {
//       const imageFile = chunk.image_filename ?? '';
//       if (!imageFile) {
//         throw new Error(`Missing image filename for chunk ${chunk.scene_id}-${chunk.chunk_id}`);
//       }
//       const imagePath = path.join(imagesFolder, imageFile);
//       const baseCvImg = await loadAndResizeImage(imagePath, width, height);
//       const totalFrames = Math.floor(duration * fps);

//       for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
//         frames.push(Buffer.from(baseCvImg));
//       }
//     } else if (assetType === 'video') {
//       const start = chunk.start || 0;
//       const videoFile = chunk.video_filename ?? '';
//       if (!videoFile) {
//         throw new Error(`Missing video filename for chunk ${chunk.scene_id}-${chunk.chunk_id}`);
//       }
//       const videoPath = path.join(imagesFolder, videoFile);

//       const videoFrames = await extractVideoFrames(videoPath, start, duration, width, height, fps);
//       frames.push(...videoFrames);
//     } else {
//       console.error(`Unknown asset type for chunk ${scene_id}-${chunk_id}, skipping.`);
//     }

//     return { sceneId: scene_id, chunkId: chunk_id, frames };
//   } catch (error) {
//     console.error(`Error processing chunk ${chunk.scene_id}-${chunk.chunk_id}: ${error.message}`);
//     return { sceneId: chunk.scene_id, chunkId: chunk.chunk_id, frames: [] };
//   }
// }

// /**
//  * Write frames to video file using ffmpeg
//  */
// async function writeFramesToVideo(
//   frames: Buffer[],
//   outputPath: string,
//   width: number,
//   height: number,
//   fps: number,
// ): Promise<void> {
//   return new Promise((resolve, reject) => {
//     const command = ffmpeg()
//       .input(`pipe:0`)
//       .inputFormat('rawvideo')
//       .inputOptions([
//         `-pix_fmt rgb24`,
//         `-s ${width}x${height}`,
//         `-r ${fps}`,
//       ])
//       .outputOptions([
//         '-c:v libx264',
//         '-preset fast',
//         '-crf 23',
//         '-pix_fmt yuv420p',
//       ])
//       .output(outputPath)
//       .on('start', (cmd) => {
//         console.log(`FFmpeg command: ${cmd}`);
//       })
//       .on('error', (err) => {
//         console.error(`Error encoding video: ${err.message}`);
//         reject(err);
//       })
//       .on('end', () => {
//         console.log(`Video written successfully: ${outputPath}`);
//         resolve();
//       });

//     const stream = command.pipe();

//     // Write all frames to stream
//     for (const frame of frames) {
//       stream.write(frame);
//     }
//     stream.end();
//   });
// }


// export async function frameGeneratorEffect(
//   scenes: any[],
//   dirs: Dirs,
//   fps: number,
//   width: number = 1920,
//   height: number = 1080,
//   maxWorkers: number = 4,
// ): Promise<string[]> {
//   const startTime = Date.now();
//   console.log('🎬 Starting Frame Generator Effect...');

//   try {
//     // Convert scenes to chunks format
//     const alignedChunks: Chunk[] = scenes.map((scene, index) => ({
//       scene_id: index + 1,
//       chunk_id: 1,
//       start_time: scene.start_time || index * 3,
//       end_time: scene.end_time || (index + 1) * 3,
//       text: scene.text || '',
//       audio_duration: scene.duration || 3,
//       asset_type: scene.type || 'image',
//       image_filename: scene.image || scene.filename,
//       video_filename: scene.video || scene.filename,
//       start: scene.video_start || 0,
//     }));

//     // Calculate total expected duration and frames
//     let totalExpectedDuration = 0;
//     let totalExpectedFrames = 0;

//     if (alignedChunks.length > 0) {
//       const firstStart = alignedChunks[0].start_time;
//       const lastEnd = alignedChunks[alignedChunks.length - 1].end_time;
//       totalExpectedDuration = lastEnd - firstStart;
//       totalExpectedFrames = Math.floor(totalExpectedDuration * fps);
//       console.log(`[DEBUG] Overall duration: ${totalExpectedDuration.toFixed(3)}s`);
//       console.log(`[DEBUG] Expected total frames: ${totalExpectedFrames}`);
//     }

//     // Set next_start_time for each chunk
//     for (let i = 0; i < alignedChunks.length; i++) {
//       if (i === alignedChunks.length - 1) {
//         alignedChunks[i].next_start_time = alignedChunks[i].end_time;
//       } else {
//         alignedChunks[i].next_start_time = alignedChunks[i + 1].start_time;
//       }
//     }

//     // Filter valid chunks
//     const validChunks = alignedChunks.filter(
//       (chunk) => chunk.audio_duration && chunk.audio_duration > 0,
//     );

//     // Sort by scene_id, chunk_id
//     validChunks.sort((a, b) => {
//       if (a.scene_id !== b.scene_id) return a.scene_id - b.scene_id;
//       return a.chunk_id - b.chunk_id;
//     });

//     if (validChunks.length === 0) {
//       console.warn('⚠️ No valid chunks to process');
//       return [];
//     }

//     console.log(`📊 Processing ${validChunks.length} chunks with ${maxWorkers} workers...`);

//     // Process chunks in parallel with concurrency limit
//     const results = await Bluebird.map(
//       validChunks,
//       async (chunk) => {
//         try {
//           const result = await processChunkFrames(
//             chunk,
//             dirs.imagesDir,
//             width,
//             height,
//             fps,
//           );
//           return { key: `${chunk.scene_id}-${chunk.chunk_id}`, result };
//         } catch (error) {
//           console.error(
//             `Chunk ${chunk.scene_id}-${chunk.chunk_id} generated an exception: ${error.message}`,
//           );
//           return {
//             key: `${chunk.scene_id}-${chunk.chunk_id}`,
//             result: { sceneId: chunk.scene_id, chunkId: chunk.chunk_id, frames: [] },
//           };
//         }
//       },
//       { concurrency: maxWorkers },
//     );

//     // Store results in a map
//     const chunkResults = new Map<
//       string,
//       { sceneId: number; chunkId: number; frames: Buffer[] }
//     >();
//     results.forEach(({ key, result }) => {
//       chunkResults.set(key, result);
//     });

//     const processingTime = (Date.now() - startTime) / 1000;
//     console.log(`⚡ Parallel processing completed in ${processingTime.toFixed(2)} seconds`);

//     // Collect frames per chunk and write to video files
//     console.log('🎯 Writing frames to video clips...');
//     const clipPaths: string[] = [];

//     for (const chunk of validChunks) {
//       const key = `${chunk.scene_id}-${chunk.chunk_id}`;
//       const result = chunkResults.get(key);
//       const frames = result?.frames || [];

//       // Calculate expected frames for this chunk
//       const duration = (chunk.next_start_time ?? chunk.end_time) - chunk.start_time;
//       const expectedFrames = Math.floor(duration * fps);

//       // Prepare final frames array for this chunk
//       const finalFrames: Buffer[] = [];

//       if (frames.length > 0) {
//         let lastFrame = frames[0];
//         for (let i = 0; i < expectedFrames; i++) {
//           if (i < frames.length) {
//             finalFrames.push(frames[i]);
//             lastFrame = frames[i];
//           } else {
//             finalFrames.push(Buffer.from(lastFrame));
//           }
//         }
//       } else {
//         console.warn(`No frames for chunk ${chunk.scene_id}-${chunk.chunk_id}, using black frames`);
//         const blackFrame = createBlackFrame(width, height);
//         for (let i = 0; i < expectedFrames; i++) {
//           finalFrames.push(Buffer.from(blackFrame));
//         }
//       }

//       // Write frames to video file
//       const clipPath = path.join(
//         dirs.outputDir,
//         `clip_${chunk.scene_id}_${chunk.chunk_id}.mp4`,
//       );

//       await writeFramesToVideo(finalFrames, clipPath, width, height, fps);
//       clipPaths.push(clipPath);

//       console.log(
//         `✅ Scene ${chunk.scene_id}-${chunk.chunk_id}: ${finalFrames.length} frames → ${clipPath}`,
//       );
//     }

//     const totalTime = (Date.now() - startTime) / 1000;
//     console.log(`🎉 Frame Generator Effect completed in ${totalTime.toFixed(2)} seconds`);
//     console.log(`📹 Generated ${clipPaths.length} video clips`);

//     return clipPaths;
//   } catch (error) {
//     console.error(`❌ Error in frameGeneratorEffect: ${error.message}`);
//     throw new Error(`Error in frameGeneratorEffect: ${error.message}`);
//   }
// }




// // import { Injectable, Logger } from '@nestjs/common';
// // import { ConfigService } from '@nestjs/config';
// // import sharp from 'sharp';
// // import ffmpeg from 'fluent-ffmpeg';
// // import * as fs from 'fs';
// // import * as path from 'path';
// // import * as Bluebird from 'bluebird';

// // // Interface definitions
// // interface Chunk {
// //   scene_id: number;
// //   chunk_id: number;
// //   start_time: number;
// //   end_time: number;
// //   next_start_time?: number;
// //   text: string;
// //   audio_duration?: number;
// //   asset_type?: 'image' | 'video';
// //   image_filename?: string;
// //   video_filename?: string;
// //   start?: number; // video start time in seconds
// // }

// // interface ProcessedFrame {
// //   buffer: Buffer;
// //   width: number;
// //   height: number;
// // }

// // @Injectable()
// // export class FrameGeneratorService {
// //   private readonly logger = new Logger(FrameGeneratorService.name);
// //   private readonly maxWorkers: number;
// //   private readonly fps: number;

// //   constructor(private configService: ConfigService) {
// //     this.maxWorkers = this.configService.get<number>('MAX_WORKER', 4);
// //     this.fps = this.configService.get<number>('FPS', 30);
// //   }

// //   /**
// //    * Load and resize image to fit within specified dimensions while maintaining aspect ratio
// //    * Equivalent to Python's load_and_resize_image
// //    */
// //   async loadAndResizeImage(
// //     imagePath: string,
// //     width: number,
// //     height: number,
// //   ): Promise<Buffer> {
// //     try {
// //       // Check if file exists
// //       if (!fs.existsSync(imagePath)) {
// //         this.logger.error(
// //           `Warning: Could not load image ${imagePath}, using black placeholder`,
// //         );
// //         return this.createBlackFrame(width, height);
// //       }

// //       // Get image metadata
// //       const metadata = await sharp(imagePath).metadata();
// //       const imgWidth = metadata.width || width;
// //       const imgHeight = metadata.height || height;

// //       // Calculate scale to fit within dimensions
// //       const scale = Math.min(width / imgWidth, height / imgHeight);
// //       const newWidth = Math.round(imgWidth * scale);
// //       const newHeight = Math.round(imgHeight * scale);

// //       // Resize image
// //       const resizedImage = await sharp(imagePath)
// //         .resize(newWidth, newHeight, {
// //           fit: 'contain',
// //           background: { r: 0, g: 0, b: 0, alpha: 1 },
// //         })
// //         .raw()
// //         .toBuffer();

// //       // Create background canvas and center the image
// //       const background = Buffer.alloc(width * height * 3);
// //       const yOffset = Math.floor((height - newHeight) / 2);
// //       const xOffset = Math.floor((width - newWidth) / 2);

// //       // Copy resized image to center of background
// //       for (let y = 0; y < newHeight; y++) {
// //         for (let x = 0; x < newWidth; x++) {
// //           const srcIdx = (y * newWidth + x) * 3;
// //           const destY = y + yOffset;
// //           const destX = x + xOffset;
// //           const destIdx = (destY * width + destX) * 3;

// //           background[destIdx] = resizedImage[srcIdx]; // R
// //           background[destIdx + 1] = resizedImage[srcIdx + 1]; // G
// //           background[destIdx + 2] = resizedImage[srcIdx + 2]; // B
// //         }
// //       }

// //       return background;
// //     } catch (error) {
// //       this.logger.error(`Error resizing image ${imagePath}: ${error.message}`);
// //       return this.createBlackFrame(width, height);
// //     }
// //   }

// //   /**
// //    * Create a black frame buffer
// //    */
// //   private createBlackFrame(width: number, height: number): Buffer {
// //     return Buffer.alloc(width * height * 3); // RGB, all zeros = black
// //   }

// //   /**
// //    * Extract frames from video segment
// //    */
// //   private async extractVideoFrames(
// //     videoPath: string,
// //     startTime: number,
// //     duration: number,
// //     width: number,
// //     height: number,
// //   ): Promise<Buffer[]> {
// //     return new Promise((resolve, reject) => {
// //       const frames: Buffer[] = [];
// //       const framesNeeded = Math.round(duration * this.fps);
// //       let framesRead = 0;

// //       ffmpeg(videoPath)
// //         .seekInput(startTime)
// //         .duration(duration)
// //         .fps(this.fps)
// //         .size(`${width}x${height}`)
// //         .outputFormat('rawvideo')
// //         .outputOptions('-pix_fmt rgb24')
// //         .on('error', (err) => {
// //           this.logger.error(`Error extracting video frames: ${err.message}`);
// //           reject(err);
// //         })
// //         .on('end', () => {
// //           // Pad with last frame if needed
// //           if (frames.length < framesNeeded && frames.length > 0) {
// //             const lastFrame = frames[frames.length - 1];
// //             const framesToAdd = framesNeeded - frames.length;
// //             for (let i = 0; i < framesToAdd; i++) {
// //               frames.push(Buffer.from(lastFrame));
// //             }
// //           } else if (frames.length === 0) {
// //             // No frames read, create black frames
// //             const blackFrame = this.createBlackFrame(width, height);
// //             for (let i = 0; i < framesNeeded; i++) {
// //               frames.push(Buffer.from(blackFrame));
// //             }
// //           }
// //           resolve(frames);
// //         })
// //         .pipe()
// //         .on('data', (chunk: Buffer) => {
// //           if (framesRead < framesNeeded) {
// //             frames.push(chunk);
// //             framesRead++;
// //           }
// //         });
// //     });
// //   }

// //   /**
// //    * Process a single chunk to generate frames
// //    * Equivalent to Python's process_chunk_frames
// //    */
// //   async processChunkFrames(
// //     chunk: Chunk,
// //     imagesFolder: string,
// //     width: number,
// //     height: number,
// //   ): Promise<{ sceneId: number; chunkId: number; frames: Buffer[] }> {
// //     try {
// //       if (!chunk.audio_duration || chunk.audio_duration <= 0) {
// //         this.logger.warn(
// //           `Skipping chunk ${chunk.scene_id}-${chunk.chunk_id} - no valid duration`,
// //         );
// //         return { sceneId: chunk.scene_id, chunkId: chunk.chunk_id, frames: [] };
// //       }

// //       const { scene_id, chunk_id } = chunk;
// //     //   const duration = chunk.next_start_time - chunk.start_time;
// //     const duration = (chunk.next_start_time ?? chunk.end_time) - chunk.start_time;

// //       const assetType = chunk.asset_type || 'image';

// //       const frames: Buffer[] = [];

// //       if (assetType === 'image') {
// //         // const imageFile = chunk.image_filename;
// //         // const imagePath = path.join(imagesFolder, imageFile);
// //         const imageFile = chunk.image_filename ?? '';
// // if (!imageFile) throw new Error(`Missing image filename for chunk ${chunk.scene_id}-${chunk.chunk_id}`);
// // const imagePath = path.join(imagesFolder, imageFile);

// //         const baseCvImg = await this.loadAndResizeImage(imagePath, width, height);
// //         const totalFrames = Math.floor(duration * this.fps);

// //         // Duplicate frame for duration
// //         for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
// //           frames.push(Buffer.from(baseCvImg));
// //         }
// //       } else if (assetType === 'video') {
// //         // const videoFile = chunk.video_filename;
// //         const start = chunk.start || 0;
// //         // const videoPath = path.join(imagesFolder, videoFile);
// //         const videoFile = chunk.video_filename ?? '';
// // if (!videoFile) throw new Error(`Missing video filename for chunk ${chunk.scene_id}-${chunk.chunk_id}`);
// // const videoPath = path.join(imagesFolder, videoFile);


// //         const videoFrames = await this.extractVideoFrames(
// //           videoPath,
// //           start,
// //           duration,
// //           width,
// //           height,
// //         );
// //         frames.push(...videoFrames);
// //       } else {
// //         this.logger.error(
// //           `Unknown asset type for chunk ${scene_id}-${chunk_id}, skipping.`,
// //         );
// //       }

// //       return { sceneId: scene_id, chunkId: chunk_id, frames };
// //     } catch (error) {
// //       this.logger.error(
// //         `Error processing chunk ${chunk.scene_id}-${chunk.chunk_id}: ${error.message}`,
// //       );
// //       return { sceneId: chunk.scene_id, chunkId: chunk.chunk_id, frames: [] };
// //     }
// //   }

// //   /**
// //    * Main frame generator function with parallel processing
// //    * Equivalent to Python's frame_generator_from_chunks
// //    * 
// //    * CHANGES FROM PYTHON:
// //    * - Uses async/await instead of asyncio
// //    * - Returns array instead of generator (Node.js generators are less common)
// //    * - Uses Bluebird.map for concurrency control (equivalent to asyncio.Semaphore)
// //    * - Uses Buffer instead of numpy arrays
// //    */
// //   async frameGeneratorFromChunks(
// //     alignedChunks: Chunk[],
// //     imagesFolder: string,
// //     width: number,
// //     height: number,
// //     maxWorkers?: number,
// //   ): Promise<Buffer[]> {
// //     const startTime = Date.now();

// //     try {
// //       // Calculate total expected duration and frames
// //       let totalExpectedDuration = 0;
// //       let totalExpectedFrames = 0;

// //       if (alignedChunks.length > 0) {
// //         const firstStart = alignedChunks[0].start_time;
// //         const lastEnd = alignedChunks[alignedChunks.length - 1].end_time;
// //         totalExpectedDuration = lastEnd - firstStart;
// //         totalExpectedFrames = Math.floor(totalExpectedDuration * this.fps);
// //         this.logger.log(`[DEBUG] Overall duration: ${totalExpectedDuration.toFixed(3)}s`);
// //         this.logger.log(`[DEBUG] Expected total frames: ${totalExpectedFrames}`);
// //       }

// //       // Set next_start_time for each chunk
// //       for (let i = 0; i < alignedChunks.length; i++) {
// //         if (i === alignedChunks.length - 1) {
// //           alignedChunks[i].next_start_time = alignedChunks[i].end_time;
// //         } else {
// //           alignedChunks[i].next_start_time = alignedChunks[i + 1].start_time;
// //         }
// //       }

// //       // Filter valid chunks
// //       const validChunks = alignedChunks.filter(
// //         (chunk) => chunk.audio_duration && chunk.audio_duration > 0,
// //       );

// //       // Sort by scene_id, chunk_id
// //       validChunks.sort((a, b) => {
// //         if (a.scene_id !== b.scene_id) return a.scene_id - b.scene_id;
// //         return a.chunk_id - b.chunk_id;
// //       });

// //       if (validChunks.length === 0) {
// //         this.logger.warn('No valid chunks to process');
// //         return [];
// //       }

// //       this.logger.log(
// //         `Starting multithreaded processing of ${validChunks.length} chunks...`,
// //       );

// //       // Determine optimal number of workers
// //       const workers = maxWorkers || this.maxWorkers;

// //       // Process chunks in parallel with concurrency limit
// //       // Using Bluebird.map for concurrency control (like asyncio.Semaphore)
// //       const results = await Bluebird.map(
// //         validChunks,
// //         async (chunk) => {
// //           try {
// //             const result = await this.processChunkFrames(
// //               chunk,
// //               imagesFolder,
// //               width,
// //               height,
// //             );
// //             return { key: `${chunk.scene_id}-${chunk.chunk_id}`, result };
// //           } catch (error) {
// //             this.logger.error(
// //               `Chunk ${chunk.scene_id}-${chunk.chunk_id} generated an exception: ${error.message}`,
// //             );
// //             return {
// //               key: `${chunk.scene_id}-${chunk.chunk_id}`,
// //               result: { sceneId: chunk.scene_id, chunkId: chunk.chunk_id, frames: [] },
// //             };
// //           }
// //         },
// //         { concurrency: workers },
// //       );

// //       // Store results in a map
// //       const chunkResults = new Map<
// //         string,
// //         { sceneId: number; chunkId: number; frames: Buffer[] }
// //       >();
// //       results.forEach(({ key, result }) => {
// //         chunkResults.set(key, result);
// //       });

// //       const processingTime = (Date.now() - startTime) / 1000;
// //       this.logger.log(`Parallel processing completed in ${processingTime.toFixed(2)} seconds`);

// //       // Yield frames in correct sequence
// //       this.logger.log('Yielding frames in sequence...');
// //       let totalFramesYielded = 0;
// //       const allFrames: Buffer[] = [];

// //       for (const chunk of validChunks) {
// //         const key = `${chunk.scene_id}-${chunk.chunk_id}`;
// //         const result = chunkResults.get(key);
// //         const frames = result?.frames || [];

// //         // Calculate expected frames for this chunk
// //         // const duration = chunk.next_start_time - chunk.start_time;
// //         const duration = (chunk.next_start_time ?? chunk.end_time) - chunk.start_time;

// //         const expectedFrames = Math.floor(duration * this.fps);
// //         let yieldedCount = 0;

// //         if (frames.length > 0) {
// //           let lastFrame = frames[0];
// //           for (let i = 0; i < expectedFrames; i++) {
// //             if (i < frames.length) {
// //               allFrames.push(frames[i]);
// //               lastFrame = frames[i];
// //             } else {
// //               // Pad with last frame if not enough frames
// //               allFrames.push(Buffer.from(lastFrame));
// //             }
// //             yieldedCount++;
// //           }
// //         } else {
// //           // No frames, fallback to black
// //           this.logger.warn(
// //             `No frames available for chunk ${chunk.scene_id}-${chunk.chunk_id}`,
// //           );
// //           const blackFrame = this.createBlackFrame(width, height);
// //           for (let i = 0; i < expectedFrames; i++) {
// //             allFrames.push(Buffer.from(blackFrame));
// //           }
// //           yieldedCount = expectedFrames;
// //         }

// //         totalFramesYielded += yieldedCount;
// //         this.logger.log(
// //           `Scene ${chunk.scene_id}-${chunk.chunk_id}: expected=${expectedFrames}, yielded=${yieldedCount}`,
// //         );
// //       }

// //       // Adjust frame count to match expected total
// //       if (totalFramesYielded !== totalExpectedFrames) {
// //         const frameDiff = totalExpectedFrames - totalFramesYielded;
// //         this.logger.warn(
// //           `Frame count mismatch: expected=${totalExpectedFrames}, yielded=${totalFramesYielded}, diff=${frameDiff}`,
// //         );

// //         if (frameDiff > 0) {
// //           // Need more frames - append last frame
// //           if (allFrames.length > 0) {
// //             const lastValidFrame = allFrames[allFrames.length - 1];
// //             this.logger.log(`Adding ${frameDiff} frames by duplicating last frame`);
// //             for (let i = 0; i < frameDiff; i++) {
// //               allFrames.push(Buffer.from(lastValidFrame));
// //             }
// //           } else {
// //             // No frames at all, create black frames
// //             const blackFrame = this.createBlackFrame(width, height);
// //             this.logger.log(`Adding ${frameDiff} black frames`);
// //             for (let i = 0; i < frameDiff; i++) {
// //               allFrames.push(Buffer.from(blackFrame));
// //             }
// //           }
// //         } else {
// //           // Too many frames - remove excess from end
// //           const framesToRemove = Math.abs(frameDiff);
// //           this.logger.log(`Removing ${framesToRemove} excess frames from end`);
// //           allFrames.splice(totalExpectedFrames);
// //         }

// //         totalFramesYielded = allFrames.length;
// //         this.logger.log(`Adjusted frame count: ${totalFramesYielded}`);
// //       }

// //       const totalTime = (Date.now() - startTime) / 1000;
// //       this.logger.log(`Total processing completed in ${totalTime.toFixed(2)} seconds`);
// //       this.logger.log(
// //         `Yielded ${totalFramesYielded} total frames (expected: ${totalExpectedFrames})`,
// //       );

// //       return allFrames;
// //     } catch (error) {
// //       throw new Error(`Error in frameGeneratorFromChunks: ${error.message}`);
// //     }
// //   }
// // }

