import * as fs from "fs/promises";
import * as path from "path";

export interface ChannelStorage {
  categoryId: string;
  channelIds: {
    [key: string]: string;
  };
}

export class StorageManager {
  private storageFile: string;
  private cache: ChannelStorage | null = null;

  constructor(
    storagePath: string = path.join(process.cwd(), "config", "storage.json")
  ) {
    this.storageFile = storagePath;
  }

  async load(): Promise<ChannelStorage | null> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const data = await fs.readFile(this.storageFile, "utf8");
      this.cache = JSON.parse(data);
      return this.cache;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      console.error("Error loading channel storage:", error);
      return null;
    }
  }

  async save(storage: ChannelStorage): Promise<void> {
    try {
      this.cache = storage;
      const dir = path.dirname(this.storageFile);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        this.storageFile,
        JSON.stringify(storage, null, 2),
        "utf8"
      );
      console.log("Info | Channel storage saved successfully");
    } catch (error) {
      console.error("Error | Channel storage saving failed:", error);
    }
  }

  async updateChannelId(key: string, channelId: string): Promise<void> {
    const storage = (await this.load()) || { categoryId: "", channelIds: {} };
    storage.channelIds[key] = channelId;
    await this.save(storage);
  }

  async updateCategoryId(categoryId: string): Promise<void> {
    const storage = (await this.load()) || { categoryId: "", channelIds: {} };
    storage.categoryId = categoryId;
    await this.save(storage);
  }
}
