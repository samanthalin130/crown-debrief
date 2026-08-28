# Safety, privacy, and the rules this project follows

## Brain data stays local

Recorded sessions, and any notes you write against them, are files on your own machine. Nothing is uploaded. The `.gitignore` excludes both, so neither can be committed by accident.

## The public site never sees your data

The version published for GFT Labs is a set of static files with no server behind it. When someone drops a CSV into it, the file is read inside their own browser and goes nowhere. There is no upload, no database, and nothing to breach.

## No model on the public site, and no keys in browsers

The debrief is computed, not generated, so it works with no AI model at all. That is deliberate: it means the public site needs no API key, costs nothing to run, and cannot leak a credential.

There is no "paste your own API key" box, and there should never be one. A key typed into a web page is readable by anyone with the device, by any browser extension, and by any script on the page. More importantly, asking people to paste credentials into websites trains a habit that phishing depends on.

If model-written answers are ever wanted on the open web, the right shape is a small service that the lab owns, holding a key the lab controls.

## Nothing is sent anywhere

There is no model in this system and no external service to send anything to. Every sentence in the debrief is assembled from a computed number, and the guide answers by retrieving a passage from these notes. Your data stays on your own machine because there is nowhere for it to go.

## Adaptation changes shape, never substance

The guide may shorten an answer, break it into steps, or slow down when your readings suggest you are scattered. It must never soften, hedge, or withhold something true because it decided you could not handle it. Shape, not substance.

## No clinical claims

This is not a medical device and nothing here is a health assessment. Focus and calm are probability scores from a consumer headset. The app describes what your data did and stops there. Statements like "your theta suggests a deficiency" are not supported by anything this device measures and do not belong in the project.

## Other people's data

If sessions from more than one person are ever collected, contributing has to be an explicit opt-in, separately from using the tool. Brain data is about as sensitive as personal data gets, and consent for that cannot be a side effect of clicking something else.
