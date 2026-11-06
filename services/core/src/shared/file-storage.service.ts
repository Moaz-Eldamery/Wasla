import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Client } from 'minio';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

/** Private objects only. Downloads always pass through the core's authorization. */
@Injectable()
export class FileStorageService implements OnModuleDestroy {
  private connection?: Client;
  private agent?: HttpAgent;

  private get client(): Client {
    if (!this.connection) {
      const endpoint = new URL(
        process.env.MINIO_ENDPOINT ?? 'http://minio:9000',
      );
      this.agent =
        endpoint.protocol === 'https:'
          ? new HttpsAgent({ keepAlive: true, timeout: 15_000 })
          : new HttpAgent({ keepAlive: true, timeout: 15_000 });
      this.connection = new Client({
        endPoint: endpoint.hostname,
        port: Number(
          endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
        ),
        useSSL: endpoint.protocol === 'https:',
        accessKey: process.env.MINIO_ACCESS_KEY ?? '',
        secretKey: process.env.MINIO_SECRET_KEY ?? '',
        region: 'us-east-1',
        transportAgent: this.agent,
      });
    }
    return this.connection;
  }

  private get bucket(): string {
    return process.env.MINIO_RESULTS_BUCKET ?? 'wasla-results';
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.putObject(this.bucket, key, body, body.length, {
      'Content-Type': contentType,
    });
  }

  get(key: string) {
    return this.client.getObject(this.bucket, key);
  }

  async remove(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  onModuleDestroy(): void {
    this.agent?.destroy();
  }
}
