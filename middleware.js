import { NextResponse } from 'next/server';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterMemory({
  points: 5, // 5 requests
  duration: 60, // per 60 seconds
});

export async function middleware(request) {
  const ip = request.ip || '127.0.0.1';
  
  try {
    await rateLimiter.consume(ip);
  } catch (error) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

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