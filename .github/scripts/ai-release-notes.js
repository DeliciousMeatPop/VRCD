#!/usr/bin/env node
'use strict'
const https = require('https')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  process.stderr.write('ANTHROPIC_API_KEY not set — skipping AI generation\n')
  process.exit(1)
}

// Collect commits since the previous tag, skipping ci/chore noise
let commits
try {
  const prevTag = execSync('git describe --tags --abbrev=0 HEAD^ 2>/dev/null', { encoding: 'utf-8' }).trim()
  commits = execSync(`git log "${prevTag}..HEAD" --pretty=format:"- %s" --no-merges`, { encoding: 'utf-8' })
} catch {
  commits = execSync('git log --pretty=format:"- %s" --no-merges -30', { encoding: 'utf-8' })
}
commits = commits
  .split('\n')
  .filter(l => l.trim() !== '-' && l.trim() !== '' && !/\[skip ci\]|^- chore: bump version/.test(l))
  .slice(0, 30)
  .join('\n')

const prompt = `You are generating release notes for VR CyberDeck, a cyberpunk-themed Electron desktop app for sideloading games to Meta Quest VR headsets. The UI has a hacker/neon aesthetic.

Git commits since last release:
${commits}

Generate:
1. release_name — short, funny, ALL_CAPS_WITH_UNDERSCORES, directly relevant to the changes. Past examples: GHOST_IN_THE_APPDATA, KILL_THE_APP_BEFORE_REMOVING_FILES
2. changelog — user-facing markdown with **Bug Fixes** and/or **New** sections (omit a section if empty). Be concise. No PR numbers, no implementation details, no commit hashes. Write as if explaining to a non-technical user what actually changed for them.

Respond with ONLY valid JSON and nothing else:
{"release_name": "THE_NAME", "changelog": "the markdown"}`

const body = JSON.stringify({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }]
})

const options = {
  hostname: 'api.anthropic.com',
  path: '/v1/messages',
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body)
  }
}

const req = https.request(options, (res) => {
  let data = ''
  res.on('data', chunk => { data += chunk })
  res.on('end', () => {
    try {
      const response = JSON.parse(data)
      const text = response.content?.[0]?.text
      if (!text) throw new Error('No text in response: ' + data)
      // Strip any accidental markdown fences before parsing
      const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
      const parsed = JSON.parse(clean)
      if (!parsed.release_name || !parsed.changelog) {
        throw new Error('Missing release_name or changelog in: ' + text)
      }
      const root = path.join(__dirname, '..', '..')
      fs.writeFileSync(path.join(root, '.github', 'release-name.txt'), parsed.release_name.trim() + '\n')
      fs.writeFileSync(path.join(root, '.github', 'release-changelog.md'), parsed.changelog.trim() + '\n')
      process.stdout.write(`Generated release name: ${parsed.release_name}\n`)
    } catch (e) {
      process.stderr.write('Failed to parse Claude response: ' + e.message + '\nRaw: ' + data + '\n')
      process.exit(1)
    }
  })
})

req.on('error', e => {
  process.stderr.write('Request failed: ' + e.message + '\n')
  process.exit(1)
})

req.write(body)
req.end()
