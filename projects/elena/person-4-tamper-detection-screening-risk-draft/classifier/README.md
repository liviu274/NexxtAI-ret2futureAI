# Image tamper baseline

This is a defensive baseline for document-image anomaly detection. It is not
a fraud verdict and it is not a replacement for the PDF checks in
`rules/rules.json`.

## Dataset limitation

MIDV-500 mainly contains genuine identity-document images and does not provide
a reliable forged/not-forged label for supervised training. This project
therefore uses the dataset as a reference bank:

1. build a feature profile for each document type;
2. compare a new image with the closest reference profile;
3. return `possible_tamper` only when the image is an outlier;
4. send uncertain or suspicious results to human review.

The result is useful for triage, not proof of manipulation. It can be
improved later with a labeled synthetic tamper set containing known edits.

## Setup

Python 3.10+ and Pillow are required. The implementation uses only Pillow and
NumPy:

```sh
python3 -m pip install pillow numpy
```

Download MIDV-500 using the supplied Kaggle snippet after authenticating
Kaggle:

```sh
python3 -m pip install kagglehub
python3 - <<'PY'
import kagglehub
path = kagglehub.dataset_download("kontheeboonmeeprakob/midv500")
print(path)
PY
```

Do not commit the downloaded dataset. Keep it outside Git or under the ignored
`data/external/` directory.

## Build the reference profile

```sh
python3 classifier/build_reference.py \
  --dataset /path/to/midv500 \
  --output data/external/midv500-reference.json
```

The script groups images by the first directory name below the dataset root.
Use `--group` when the dataset has a different layout.

## Check an image

```sh
python3 classifier/check_image.py \
  --reference data/external/midv500-reference.json \
  --image /path/to/document.jpg \
  --document-type id
```

The JSON response contains the score, nearest reference, threshold, and a
human-review recommendation. It does not claim that a file is forged.
