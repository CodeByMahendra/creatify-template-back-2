// src/scenes/scenes.service.ts
import { Injectable } from "@nestjs/common";
import { SceneDto } from "./dto/scene.dto";
import { join } from "path";

import { existsSync } from "fs";
import { ensureDir, runFFmpeg } from "src/utils/ffmpeg.utils";

@Injectable()
export class ScenesService {
  private uploadDir = join(process.cwd(), "uploads");
  private outputDir = join(process.cwd(), "output");

  constructor() {
    ensureDir(this.uploadDir);
    ensureDir(this.outputDir);
  }

  async buildVideo(scenes: SceneDto[]): Promise<string> {
    const clips: string[] = [];

    // Step 1: Har scene se ek clip banao
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const inputPath = join(this.uploadDir, scene.image_filename);

      if (!existsSync(inputPath)) {
        throw new Error(`❌ File not found: ${scene.image_filename}`);
      }

      const outputPath = join(this.outputDir, `${scene.chunk_id}.mp4`);

      // Ken Burns (zoom + pan)
      const filter = `zoompan=z='zoom+0.001':d=25*${scene.duration}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720`;

      const args = [
        "-y",
        "-loop", "1",
        "-i", inputPath,
        "-vf", filter,
        "-c:v", "libx264",
        "-t", scene.duration.toString(),
        "-pix_fmt", "yuv420p",
        outputPath
      ];

      await runFFmpeg(args);
      clips.push(outputPath);
    }

    // Step 2: Clips ko concat karna
    const concatFile = join(this.outputDir, "concat.txt");
    const fs = await import("fs/promises");
    await fs.writeFile(concatFile, clips.map(c => `file '${c}'`).join("\n"));

    const finalOutput = join(this.outputDir, "final.mp4");

    const concatArgs = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatFile,
      "-c", "copy",
      finalOutput
    ];

    await runFFmpeg(concatArgs);

    return finalOutput;
  }
}
