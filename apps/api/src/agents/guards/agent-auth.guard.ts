import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';

@Injectable()
export class AgentAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const agentId = request.headers['x-computemesh-agent-id'];
    const authHeader = request.headers['authorization'];

    if (!agentId || typeof agentId !== 'string') {
      throw new UnauthorizedException('Missing or invalid X-ComputeMesh-Agent-ID header');
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const agentSecret = authHeader.substring(7);
    const db = getDatabaseClient();

    const crypto = require('crypto');
    const secretHash = crypto.createHash('sha256').update(agentSecret).digest('hex');

    const identity = await db.agentIdentity.findUnique({
      where: { id: agentId },
      include: { machine: true }
    });

    if (!identity) {
      throw new UnauthorizedException('Invalid agent credentials');
    }

    if (identity.credentialHash !== secretHash) {
      throw new UnauthorizedException('Invalid agent credentials');
    }

    if (identity.status !== 'ACTIVE') {
      throw new ForbiddenException('Agent identity is revoked');
    }

    if (identity.machine.status === 'DISABLED') {
      throw new ForbiddenException('Machine is disabled');
    }

    // Attach machineId and agentId to the request for the controller to use
    request.agent = {
      id: identity.id,
      machineId: identity.machineId,
      providerId: identity.machine.providerId,
    };

    return true;
  }
}
