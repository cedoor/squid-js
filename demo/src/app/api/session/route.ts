import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getDemoEvaluator } from '@/lib/load-demo-evaluator'
import { sessions } from '@/lib/sessions'

export async function POST() {
  const sessionId = randomUUID()
  sessions.set(sessionId, getDemoEvaluator())
  return NextResponse.json({ sessionId })
}
