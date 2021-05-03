import Redis from 'ioredis';
import config from 'config';

const DB_SEARCHING = 'DB Searching';

interface CacheOption {
  host: string;
  port: number;
  baseKey?: string;
  ttl?: number;
}

class PSCache {
  private readonly redisClient: Redis.Redis;
  private readonly pubRedisClient: Redis.Redis;
  private readonly subRedisClient: Redis.Redis;
  private readonly baseKey?: string;
  private readonly redisTTL: number;

  constructor() {
    const options = config.get('redis') as CacheOption;
    if (options.baseKey) {
      this.baseKey = options.baseKey;
    }

    if (options.ttl) {
      this.redisTTL = options.ttl;
    }

    this.redisClient = new Redis({
      host: options.host,
      port: options.port,
    });

    this.pubRedisClient = new Redis({
      host: options.host,
      port: options.port,
    });

    this.subRedisClient = new Redis({
      host: options.host,
      port: options.port,
    });

    this.subRedisClient.setMaxListeners(25);
  }

  private async getCache(key: string, prefix: string): Promise<any | null> {
    const result = await this.redisClient.get(this.createRealKey(key, prefix));
    if (result) {
      return result;
    }
    return null;
  }
  private async setCache(key: string, value: any, prefix: string): Promise<void> {
    await this.redisClient.set(this.createRealKey(key, prefix), JSON.stringify(value), 'EX', this.redisTTL || 300);
  }

  private async pub(topic: string, message: string): Promise<void> {
    await this.pubRedisClient.publish(topic, message);
  }

  private async sub(topic: string): Promise<string> {
    let result: string = '';
    this.subRedisClient.subscribe(topic, (err, count) => {
      if (err) {
        console.error('Failed to subscribe : ', err.message);
        throw new Error();
      }
      console.log(`Subscribed successfully! This client is currently subscribed to ${count} channels.`);
    });
    this.subRedisClient.on('message', (channel, message) => {
      console.log('message', channel, message);
      result = message;
    });
    return result;
  }
  private createRealKey(key: string, prefix: string) {
    return (this.baseKey + '/' + prefix + '/' + key).toLowerCase();
  }

  private async isEqual(fromRedis: string, input: string): Promise<boolean> {
    if (fromRedis === input) {
      return true;
    }
    return false;
  }

  public async find(key: number, repository: any): Promise<string> {
    try {
      // search data in cache
      const cachedReservation = await this.getCached(key);
      if (cachedReservation) {
        if (await this.isEqual(cachedReservation, DB_SEARCHING)) {
          const fromPub = await this.sub(key.toString());
          return fromPub;
        } else {
          return cachedReservation;
        }
      }

      // if cache-miss, set DB_SEARCHING value in key and find by DB

      await this.setCache(key.toString(), DB_SEARCHING, '');
      const dbReservation = await repository.findById(key);
      await this.setCache(key.toString(), JSON.stringify(dbReservation.name), '');
      await this.pub(key.toString(), JSON.stringify(dbReservation.name));
      console.log(`UNCACHED ${key} RESERVATION`);
      return JSON.stringify(dbReservation.name);
    } catch (e) {
      console.error('getProductIds ERROR : ', e);
      throw new Error();
    }
  }

  private async getCached(key: number): Promise<string | null> {
    const cachedReservation = await this.getCache(key.toString(), '');
    if (!cachedReservation) {
      console.log(`there isn't exsit ${key}`);
      return null;
    }

    try {
      return JSON.parse(cachedReservation) as string;
    } catch (e) {
      console.error(`can't parse cachedReservation: ${cachedReservation}`);
      return null;
    }
  }
}



export const psCache = new PSCache();