import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from './errorHandler.js';
import { apiNotFoundHandler } from './notFoundHandler.js';
import { AppError } from '../../shared/errors/AppError.js';

function mockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('apiNotFoundHandler', () => {
  it('returns JSON 404', () => {
    const req = {
      method: 'GET',
      originalUrl: '/api/missing',
    } as Request;
    const res = mockRes();
    apiNotFoundHandler(req, res as unknown as Response, vi.fn() as NextFunction);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'No route GET /api/missing',
      },
    });
  });
});

describe('errorHandler', () => {
  it('maps AppError to the status envelope', () => {
    const req = { path: '/api/x', method: 'GET' } as Request;
    const res = mockRes();
    errorHandler(
      new AppError('VALIDATION_ERROR', 'bad input', 400),
      req,
      res as unknown as Response,
      vi.fn() as NextFunction,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'bad input' },
    });
  });

  it('hides internal details in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const req = { path: '/api/x', method: 'GET' } as Request;
    const res = mockRes();
    errorHandler(
      new Error('secret stack detail'),
      req,
      res as unknown as Response,
      vi.fn() as NextFunction,
    );
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    process.env.NODE_ENV = prev;
  });
});
