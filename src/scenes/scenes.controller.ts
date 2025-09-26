// src/scenes/scenes.controller.ts
import { Body, Controller, Post } from "@nestjs/common";
import { ScenesService } from "./scenes.service";
import { SceneDto } from "./dto/scene.dto";

@Controller("scenes")
export class ScenesController {
  constructor(private readonly scenesService: ScenesService) {}

  @Post("build")
  async build(@Body("scenes") scenes: SceneDto[]) {
    const videoPath = await this.scenesService.buildVideo(scenes);
    return { message: "✅ Video created", path: videoPath };
  }
}
