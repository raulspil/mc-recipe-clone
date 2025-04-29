import { NextResponse } from 'next/server';

// Simple in-memory rate limiting
const rateLimit = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5;

export async function middleware(request) {
  const ip = request.ip || '127.0.0.1';
  const now = Date.now();
  
  // Clean up old entries
  for (const [key, timestamp] of rateLimit.entries()) {
    if (now - timestamp > RATE_LIMIT_WINDOW) {
      rateLimit.delete(key);
    }
  }
  
  // Check rate limit
  const requestCount = Array.from(rateLimit.values())
    .filter(timestamp => now - timestamp <= RATE_LIMIT_WINDOW)
    .length;
    
  if (requestCount >= MAX_REQUESTS) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }
  
  // Add current request
  rateLimit.set(ip, now);

  const response = NextResponse.next();
  
  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Content-Security-Policy', "default-src 'self'");
  
  return response;
}

export const config = {
  matcher: '/api/:path*',
}; 