#!/bin/bash
export DATABASE_URL="postgresql://computemesh:computemesh_dev@localhost:5433/computemesh?schema=public"
cd ~/projects/ComputeMesh/packages/database
cat << 'EOF' > check2.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.agentIdentity.findUnique({where: {id: '0e1aa896-8832-4652-8b55-699b8aadaebc'}}).then(console.log).finally(()=>prisma.$disconnect());
EOF
node check2.js
