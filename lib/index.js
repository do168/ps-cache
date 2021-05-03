"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisService = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = __importDefault(require("config"));
const DB_SEARCHING = 'DB Searching';
class RedisService {
    constructor() {
        const options = config_1.default.get('redis');
        if (options.baseKey) {
            this.baseKey = options.baseKey;
        }
        if (options.ttl) {
            this.redisTTL = options.ttl;
        }
        this.redisClient = new ioredis_1.default({
            host: options.host,
            port: options.port,
        });
        this.pubRedisClient = new ioredis_1.default({
            host: options.host,
            port: options.port,
        });
        this.subRedisClient = new ioredis_1.default({
            host: options.host,
            port: options.port,
        });
        this.subRedisClient.setMaxListeners(25);
    }
    getCache(key, prefix) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.redisClient.get(this.createRealKey(key, prefix));
            if (result) {
                return result;
            }
            return null;
        });
    }
    setCache(key, value, prefix) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redisClient.set(this.createRealKey(key, prefix), JSON.stringify(value), 'EX', this.redisTTL || 300);
        });
    }
    pub(topic, message) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.pubRedisClient.publish(topic, message);
        });
    }
    sub(topic) {
        return __awaiter(this, void 0, void 0, function* () {
            let result = '';
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
        });
    }
    createRealKey(key, prefix) {
        return (this.baseKey + '/' + prefix + '/' + key).toLowerCase();
    }
    isEqual(fromRedis, input) {
        return __awaiter(this, void 0, void 0, function* () {
            if (fromRedis === input) {
                return true;
            }
            return false;
        });
    }
    find(key, repository) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // search data in cache
                const cachedReservation = yield this.getCached(key);
                if (cachedReservation) {
                    if (yield exports.redisService.isEqual(cachedReservation, DB_SEARCHING)) {
                        const fromPub = yield exports.redisService.sub(key.toString());
                        return fromPub;
                    }
                    else {
                        return cachedReservation;
                    }
                }
                // if cache-miss, set DB_SEARCHING value in key and find by DB
                yield exports.redisService.setCache(key.toString(), DB_SEARCHING, '');
                const dbReservation = yield repository.findById(key);
                yield exports.redisService.setCache(key.toString(), JSON.stringify(dbReservation.name), '');
                yield exports.redisService.pub(key.toString(), JSON.stringify(dbReservation.name));
                console.log(`UNCACHED ${key} RESERVATION`);
                return JSON.stringify(dbReservation.name);
            }
            catch (e) {
                console.error('getProductIds ERROR : ', e);
                throw new Error();
            }
        });
    }
    getCached(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const cachedReservation = yield exports.redisService.getCache(key.toString(), '');
            if (!cachedReservation) {
                console.log(`there isn't exsit ${key}`);
                return null;
            }
            try {
                return JSON.parse(cachedReservation);
            }
            catch (e) {
                console.error(`can't parse cachedReservation: ${cachedReservation}`);
                return null;
            }
        });
    }
}
exports.redisService = new RedisService();
