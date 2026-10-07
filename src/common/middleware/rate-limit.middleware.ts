import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  lastRequestTime: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  // Cuốn sổ đen ghi lại địa chỉ IP và số lần gọi
  private blacklist: Map<string, RateLimitRecord> = new Map();

  use(req: Request, res: Response, next: NextFunction) {
    // Lấy IP của người dùng và mốc thời gian hiện tại
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Nếu IP chưa từng gọi tới, khởi tạo bản ghi mới
    if (!this.blacklist.has(ip)) {
      this.blacklist.set(ip, { count: 1, lastRequestTime: now });
      return next();
    }

    const record = this.blacklist.get(ip)!;
    
    // Nếu đã qua 10 giây (10000ms), reset số đếm về 1 (tức là 0 rồi cộng 1 cho request hiện tại)
    if (now - record.lastRequestTime > 10000) {
      record.count = 1;
      record.lastRequestTime = now;
      return next();
    }

    // Nếu vẫn trong 10 giây, tăng số đếm lên 1
    record.count++;

    // Nếu số lần gọi vượt quá 5 lần, chặn đứng lại với mã lỗi 429
    if (record.count > 5) {
      return res.status(429).json({
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Bạn đã gửi quá nhiều request. Vui lòng đợi một lát trước khi thử lại.'
      });
    }

    // Nếu hợp lệ, cho request đi tiếp
    next();
  }
}
