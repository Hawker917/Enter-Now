# GOLDEN BASELINE — DO NOT ALTER

This file marks a known-good Enter Now milestone.

At this commit, iPhone Web Push successfully delivers a cue while the iPhone screen is locked and black.

## IMPORTANT

**DO NOT ALTER, REWRITE, REBASE, OR DELETE THIS WORKING BASELINE.**

Any future audio, UI, or feature experiments must be reversible and must preserve this known-good behavior.

If an experiment breaks locked-screen push, restore this baseline first.

The remaining work after this baseline is primarily audio: replace the current faint iOS notification sound with the intended Enter Now Beep-Boop cue.
