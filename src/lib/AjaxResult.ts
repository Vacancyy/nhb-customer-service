/**
 * 统一 API 响应结果封装
 */
export class AjaxResult<T = unknown> {
  constructor(
    public code: number,
    public msg: string,
    public data: T | null
  ) {}

  static success<T>(data: T, msg = ''): AjaxResult<T> {
    return new AjaxResult(200, msg, data);
  }

  static error<T = null>(msg: string, code = 500, data: T | null = null): AjaxResult<T> {
    return new AjaxResult(code, msg, data);
  }
}