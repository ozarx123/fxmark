/**
 * Structured audit line for privileged admin routes (stdout; ship to SIEM from log drain).
 */
export function adminAuditMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    try {
      const path = (req.originalUrl || req.url || '').split('?')[0] || req.path || '';
      const line = JSON.stringify({
        type: 'admin_audit',
        requestId: req.id,
        method: req.method,
        path,
        userId: req.user?.id ?? null,
        role: req.user?.role ?? null,
        status: res.statusCode,
        ms: Date.now() - start,
        ip: req.ip || req.socket?.remoteAddress || null,
      });
      console.log(line);
    } catch {
      // ignore audit serialization errors
    }
  });
  next();
}
