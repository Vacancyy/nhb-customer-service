// 雪花算法 ID 生成器
// 生成 64 位整数 ID，结构：1位符号 + 41位时间戳 + 10位机器ID + 12位序列号

export class SnowflakeGenerator {
  private workerId: number;
  private sequence: number = 0;
  private lastTimestamp: number = -1;

  // 起始时间戳（2024-01-01），可根据需要调整
  private readonly epoch = 1704067200000;

  // 各部分位数
  private readonly workerIdBits = 10;    // 机器 ID 位数
  private readonly sequenceBits = 12;    // 序列号位数

  // 最大值
  private readonly maxWorkerId = -1 ^ (-1 << this.workerIdBits);  // 1023
  private readonly maxSequence = -1 ^ (-1 << this.sequenceBits);  // 4095

  // 位移
  private readonly workerIdShift = this.sequenceBits;
  private readonly timestampShift = this.sequenceBits + this.workerIdBits;

  constructor(workerId: number = 1) {
    if (workerId < 0 || workerId > this.maxWorkerId) {
      throw new Error(`workerId must be between 0 and ${this.maxWorkerId}`);
    }
    this.workerId = workerId;
  }

  // 生成下一个 ID
  public nextId(): bigint {
    let timestamp = Date.now();

    // 时钟回拨处理
    if (timestamp < this.lastTimestamp) {
      throw new Error(`Clock moved backwards. Refusing to generate id for ${this.lastTimestamp - timestamp} milliseconds`);
    }

    // 同一毫秒内
    if (timestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1) & this.maxSequence;
      // 序列号溢出，等待下一毫秒
      if (this.sequence === 0) {
        timestamp = this.waitNextMillis(this.lastTimestamp);
      }
    } else {
      // 新毫秒，序列号从 0 开始
      this.sequence = 0;
    }

    this.lastTimestamp = timestamp;

    // 组合 ID
    const id = BigInt(timestamp - this.epoch) << BigInt(this.timestampShift)
      | BigInt(this.workerId) << BigInt(this.workerIdShift)
      | BigInt(this.sequence);

    return id;
  }

  // 等待下一毫秒
  private waitNextMillis(lastTimestamp: number): number {
    let timestamp = Date.now();
    while (timestamp <= lastTimestamp) {
      timestamp = Date.now();
    }
    return timestamp;
  }
}

// 全局单例
let generator: SnowflakeGenerator | null = null;

// 获取生成器实例
export function getSnowflakeGenerator(): SnowflakeGenerator {
  if (!generator) {
    const workerId = parseInt(process.env.SNOWFLAKE_WORKER_ID || '1');
    generator = new SnowflakeGenerator(workerId);
  }
  return generator;
}

// 生成新 ID（便捷方法）
export function generateId(): bigint {
  return getSnowflakeGenerator().nextId();
}