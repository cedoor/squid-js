'use client'

import { useCallback } from 'react'
import { Poulpy } from '@/components/mascot/Poulpy'
import { Btn } from '@/components/atoms/Btn'
import { ServerTerminal } from '@/components/terminal/ServerTerminal'
import { Step1Keygen } from '@/components/steps/Step1Keygen'
import { Step2Encrypt } from '@/components/steps/Step2Encrypt'
import { Step3Evaluate } from '@/components/steps/Step3Evaluate'
import { Step4Decrypt } from '@/components/steps/Step4Decrypt'
import { useFhe } from '@/hooks/useFhe'
function Footer() {
  return (
    <div
      style={{
        marginTop: 4,
        paddingTop: 14,
        borderTop: '1px dashed var(--rule)',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 11.5,
        color: 'var(--ink-faint)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: 0.3,
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <span>scheme: CGGI · plaintext: u32</span>
      <span>
        legend:{' '}
        <span style={{ color: 'var(--plain)' }}>● plaintext</span>{' '}
        <span style={{ color: 'var(--cipher)' }}>● ciphertext</span>{' '}
        <span style={{ color: 'var(--key)' }}>● keys</span>
      </span>
      <span>poulpy-js demo · not for production use</span>
    </div>
  )
}

export default function Demo() {
  const { state, doKeygen, doEncrypt, doEvaluate, doDecrypt, doReset, setA, setB } = useFhe()
  const { phase, skPreview, ekBytes, sessionId, a, b, ctA, ctB, ctSum, result, logs, error } = state

  const busy = phase !== 'idle'

  // Mood: thinking while busy, brief happy flash after keygen/decrypt, locked on error
  // Derive mood from state
  let mood: 'idle' | 'thinking' | 'happy' | 'locked' = 'idle'
  if (error) mood = 'locked'
  else if (busy) mood = 'thinking'
  else if (result !== null) mood = 'happy'

  const handleEncrypt = useCallback(() => {
    doEncrypt(a, b)
  }, [doEncrypt, a, b])

  const handleEvaluate = useCallback(() => {
    if (ctA && ctB && sessionId) {
      doEvaluate(ctA, ctB, sessionId)
    }
  }, [doEvaluate, ctA, ctB, sessionId])

  const handleDecrypt = useCallback(() => {
    if (ctSum) doDecrypt(ctSum)
  }, [doDecrypt, ctSum])

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '28px 32px 40px',
        maxWidth: 1400,
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          paddingBottom: 18,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <Poulpy size={68} mood={mood} tint="var(--plain)" />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 2,
              color: 'var(--ink-faint)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Poulpy · FHE playground
          </div>
          <h1
            style={{
              margin: '4px 0 2px',
              fontFamily: 'var(--font-serif)',
              fontWeight: 500,
              fontSize: 36,
              letterSpacing: -0.6,
              lineHeight: 1.05,
            }}
          >
            Add two numbers{' '}
            <em style={{ fontStyle: 'italic', color: 'var(--cipher)' }}>without</em> the server
            ever seeing them.
          </h1>
          <div
            style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 4, maxWidth: 780 }}
          >
            An end-to-end walkthrough of a CGGI homomorphic addition — keygen, encrypt, evaluate,
            decrypt — using the{' '}
            <a
              href="https://github.com/poulpy-fhe/poulpy"
              target="_blank"
              rel="noreferrer"
              style={{
                color: 'var(--ink)',
                textDecoration: 'underline',
                textDecorationColor: 'var(--plain)',
                textDecorationThickness: 2,
              }}
            >
              Poulpy
            </a>{' '}
            library.
          </div>
          {error && (
            <div
              style={{
                marginTop: 8,
                fontSize: 13,
                color: 'oklch(0.7 0.18 25)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ✗ {error}
            </div>
          )}
        </div>
        <Btn onClick={doReset} small>
          Reset demo
        </Btn>
      </header>

      {/* Two-column grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.35fr) minmax(360px, 1fr)',
          gap: 22,
          alignItems: 'start',
        }}
      >
        {/* Left column — steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Step1Keygen
            skPreview={skPreview}
            ekBytes={ekBytes}
            sessionId={sessionId}
            phase={phase}
            onGenerate={doKeygen}
          />
          <Step2Encrypt
            hasKeys={!!ekBytes}
            a={a}
            b={b}
            ctA={ctA}
            ctB={ctB}
            phase={phase}
            onSelectA={setA}
            onSelectB={setB}
            onEncrypt={handleEncrypt}
          />
          <Step3Evaluate
            ctA={ctA}
            ctB={ctB}
            ctSum={ctSum}
            phase={phase}
            onEvaluate={handleEvaluate}
          />
          <Step4Decrypt
            ctSum={ctSum}
            result={result}
            phase={phase}
            a={a}
            b={b}
            onDecrypt={handleDecrypt}
          />
          <Footer />
        </div>

        {/* Right column — server terminal */}
        <div
          style={{
            position: 'sticky',
            top: 20,
            height: 'calc(100vh - 40px)',
            minHeight: 560,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  color: 'var(--ink-faint)',
                }}
              >
                the other side
              </div>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 500,
                  fontSize: 22,
                }}
              >
                Server log
              </h2>
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
              crypto runs in your browser
            </span>
          </div>
          <ServerTerminal logs={logs} running={busy} />
        </div>
      </div>
    </div>
  )
}
