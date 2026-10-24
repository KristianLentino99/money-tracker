import { requestContext } from '@common/request-context';
import type { NextFunction, Request, Response } from 'express';

/**
 * Marks the request as PSU-present so bank API calls forward the user's IP and user agent.
 * Apply only to routes the user triggers directly; background refreshes must stay unattended.
 */
export const attachPsuContext = (req: Request, _res: Response, next: NextFunction) => {
  const context = requestContext.getContext();
  const ipAddress = req.ip?.replace(/^::ffff:/, '');
  const userAgent = req.get('user-agent');

  if (context && ipAddress && userAgent) {
    context.psu = { ipAddress, userAgent };
  }

  next();
};
