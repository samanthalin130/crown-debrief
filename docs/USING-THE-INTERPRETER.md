# How to use the interpreter

Written for someone who has never opened a terminal and does not want to. If you
can drag a file onto a web page, you can use this.

---

## What it does, in one line

You give it a recording from your Neurosity headset, and it tells you what happened
during that recording in plain English.

## Step 1: get a recording out of the Neurosity console

1. Go to the Neurosity console in your browser and sign in.
2. Open **Recordings**.
3. Find the session you want and choose **Export**, then **CSV**.
4. A file downloads. It will have a name like `Meditation - Focus to Calm.csv` or a
   made-up name like `Limegreen horse.csv`. Either is fine.

The file will be large. Five minutes of recording is about 13 MB. That is normal:
the headset writes 256 rows every second.

## Step 2: open the interpreter

Go to the interpreter page in a browser. Chrome, Safari, Firefox and Edge all work.
On a phone it will work but the charts are easier to read on a laptop.

## Step 3: drop the file in

Drag the CSV from your downloads folder onto the box that says **Drop a recording
here**. Or click **Choose a file** and pick it.

Nothing uploads. The file is read inside your own browser and never sent anywhere.
There is nowhere for it to go: the page has no server behind it.

Wait a few seconds. A five-minute recording takes about three seconds to read.

## Step 4: read what comes back

The page fills in from top to bottom, in the order you should read it.

**The 10-second version.** One sentence saying what the recording did, and five
small cards with the headline numbers. If you read nothing else, read this.

**Step 1, what is readable here.** Eight boxes, one per sensor. This is the most
important part of the page and it comes first on purpose.

- **clean** means that sensor was sitting properly on your head. Trust it.
- **marginal** means it was noisy but usable. Read it with some caution.
- **artifact** means it was picking up jaw and face muscle rather than brain
  rhythm. These boxes are drawn with diagonal stripes and are left out of
  everything below. It is completely normal for most sensors to land here.
- **flat** means that sensor was not touching your skin at all.

If every box says artifact, the page will tell you it cannot read the recording and
will stop. That is the honest answer, not a failure.

**Step 2, what the recording did.** Two charts showing how the signal changed over
the session, minute by minute. Read the *shape*: whether a line went up, when it
peaked, whether it came back down. Do not read too much into the exact numbers.

**Step 3, the reading.** Sentences describing what the charts show. Click any row to
open it and see the exact figures behind that sentence, so you can check it.

**Step 4, the two indicators.** A calm indicator and a focus indicator. Click each
one to see what it is built from, and importantly what it is *not*.

**Step 5, every electrode, every band.** The full table, if you want it.

**Finally, what this cannot tell you.** Read this before repeating any number from
the page to anyone.

## The one thing to understand before you trust a number

The console shows you a **focus score** and a **calm score** while you are wearing
the headset. Those come from models Neurosity trained, they run on the headset
itself, and **they are not saved into a recording**. When you export, they are gone.

So the calm and focus figures on this page are not those scores. They are
*indicators* this page works out from the raw signal, using published methods. They
are useful for comparing one minute of your recording against another minute of the
same recording. They are not comparable to a number the console showed you, and the
page says so wherever they appear.

## Buttons worth knowing about

- **Underlined dotted words** are terms with an explanation. Click one and the
  explanation opens right there on the page.
- **Expand all**, at the top right, opens every drop-down at once.
- **Copy summary** puts a short labelled summary of the session on your clipboard,
  ready to paste into an email or into whichever AI assistant you prefer. The page
  works out the numbers; the assistant can do the words.
- **Read another recording** clears the page so you can drop in a different file.

## If something goes wrong

**"That does not look like a Neurosity console CSV export."** You have most likely
dropped the wrong file. This page reads the *console's* export, which has eleven
columns and no header row. If your file has a column called `focus`, it came from
the focus logger instead, and the session debrief reads that one.

**Nothing happens when you drop the file.** Try the **Choose a file** button rather
than dragging.

**It says it cannot read the recording.** If every sensor came out as artifact, the
headset was not making good contact. Part your hair under each sensor, wait for the
console's signal quality to settle before you start, and record again.
