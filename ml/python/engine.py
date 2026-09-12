"""One local request over stdin/stdout. No listener, network or user-supplied code."""
import json
import sys
from pathlib import Path


def train(request):
    samples = sorted(request["samples"], key=lambda s: (s["date"], s["id"]))
    dates = sorted(set(s["date"] for s in samples))
    if len(samples) < 30 or len(dates) < 12:
        return {"status": "insufficient", "numberOfSamples": len(samples), "message": "Na model treba aspoň 30 výsledkov z 12 rôznych dátumov."}
    import numpy as np
    from sklearn.feature_extraction import DictVectorizer
    from sklearn.preprocessing import StandardScaler
    from sklearn.pipeline import make_pipeline
    from sklearn.linear_model import Ridge
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import mean_absolute_error, mean_squared_error
    from sklearn.model_selection import TimeSeriesSplit

    x = [s["features"] for s in samples]
    y = np.array([s["target"] for s in samples])
    cutoff = dates[max(1, int(len(dates)*.8))]
    train_ids = [i for i,s in enumerate(samples) if s["date"] < cutoff]
    holdout = [i for i,s in enumerate(samples) if s["date"] >= cutoff]
    train_dates = [d for d in dates if d < cutoff]
    algorithms = ["ridge-10", "ridge-100", "forest"]

    def pipeline(name):
        estimator = RandomForestRegressor(n_estimators=100, max_depth=4, min_samples_leaf=4, random_state=42, n_jobs=2) if name == "forest" else Ridge(alpha=float(name.split("-")[1]))
        return make_pipeline(DictVectorizer(sparse=False), StandardScaler(), estimator)

    def evaluate(name, fit_ids, eval_ids):
        model = pipeline(name).fit([x[i] for i in fit_ids], y[fit_ids])
        prediction = np.clip(model.predict([x[i] for i in eval_ids]),0,100)
        return model, {"mae": float(mean_absolute_error(y[eval_ids], prediction)), "rmse": float(np.sqrt(mean_squared_error(y[eval_ids],prediction)))}

    scores = []
    for name in algorithms:
        fold_scores = []
        for fit_dates, eval_dates in TimeSeriesSplit(n_splits=3).split(train_dates):
            a = set(train_dates[i] for i in fit_dates)
            b = set(train_dates[i] for i in eval_dates)
            _, metrics = evaluate(name, [i for i in train_ids if samples[i]["date"] in a], [i for i in train_ids if samples[i]["date"] in b])
            fold_scores.append(metrics["mae"])
        scores.append({"algorithm": name, "cvMae": float(np.mean(fold_scores))})
    winner = min(scores, key=lambda score: score["cvMae"])["algorithm"]
    _, metrics = evaluate(winner, train_ids, holdout)
    baseline = np.array([samples[i]["baseline"] for i in holdout])
    baseline_mae = float(mean_absolute_error(y[holdout],baseline))
    incumbent_metrics = None
    if request.get("incumbentAlgorithm") in algorithms:
        # Refit incumbent architecture on the SAME prefix: never evaluate a model on its own training rows.
        _, incumbent_metrics = evaluate(request["incumbentAlgorithm"], train_ids, holdout)
    accepted = metrics["mae"] <= 15 and metrics["mae"] <= baseline_mae*.95
    if incumbent_metrics:
        accepted = accepted and metrics["mae"] <= incumbent_metrics["mae"] and metrics["rmse"] <= incumbent_metrics["rmse"]
    final = pipeline(winner).fit(x,y)
    vectorizer, scaler, estimator = final.steps[0][1], final.steps[1][1], final.steps[2][1]
    portable = {"features": vectorizer.feature_names_, "mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()}
    if winner == "forest":
        portable["trees"] = [{"left": tree.tree_.children_left.tolist(), "right": tree.tree_.children_right.tolist(), "feature": tree.tree_.feature.tolist(), "threshold": tree.tree_.threshold.tolist(), "value": tree.tree_.value[:,0,0].tolist()} for tree in estimator.estimators_]
    else:
        portable.update({"coefficients": estimator.coef_.tolist(), "intercept": float(estimator.intercept_)})
    return {"status": "activated" if accepted else "rejected", "numberOfSamples": len(samples), "algorithm": winner, **metrics,
            "baselineMae": baseline_mae, "incumbent": incumbent_metrics, "candidates": scores,
            "validationMethod": "3 expanding temporal folds; final 20% of distinct dates held out; incumbent refit on identical prefix",
            "holdoutSize": len(holdout), "features": vectorizer.feature_names_, "model": portable,
            "referencePredictions": np.clip(final.predict(x[:3]),0,100).tolist()}


def render_document(request):
    import base64
    import io
    import pypdfium2 as pdfium
    pages = []
    size = 0
    with pdfium.PdfDocument(request["path"]) as document:
        for index in range(min(5, len(document))):
            page = document[index]
            scale = min(120 / 72, 3000 / max(page.get_size()))
            bitmap = page.render(scale=scale)
            try:
                with bitmap.to_pil() as image, io.BytesIO() as output:
                    image.save(output, format="PNG")
                    encoded = base64.b64encode(output.getvalue()).decode("ascii")
            finally:
                bitmap.close()
                page.close()
            if size + len(encoded) > 6_000_000: break
            pages.append(encoded)
            size += len(encoded)
        return {"pages": pages, "partial": len(pages) < len(document)}


def parse_document(request):
    path = Path(request["path"])
    if path.suffix.lower() == ".txt":
        return {"text": path.read_text(encoding="utf-8", errors="replace")[:100000], "status": "text"}
    if path.suffix.lower() == ".docx":
        import zipfile
        from xml.etree import ElementTree
        with zipfile.ZipFile(path) as archive:
            info = archive.getinfo("word/document.xml")
            if info.file_size > 5_000_000: raise ValueError("Document is too large")
            root = ElementTree.fromstring(archive.read(info))
            paragraphs = ["".join(p.itertext()) for p in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p")]
        return {"text": "\n".join(paragraphs)[:100000], "status": "text"}
    import pypdfium2 as pdfium
    try:
        document = pdfium.PdfDocument(path)
    except pdfium.PdfiumError as error:
        if error.err_code == pdfium.raw.FPDF_ERR_PASSWORD:
            return {"text": "", "status": "password"}
        raise
    with document:
        parts = []
        for index in range(min(100, len(document))):
            page = document[index]
            textpage = page.get_textpage()
            try:
                parts.append(textpage.get_text_bounded().replace("\r\n", "\n"))
            finally:
                textpage.close()
                page.close()
            if sum(map(len, parts)) >= 100000: break
        text = "\n".join(parts)[:100000]
    return {"text": text, "status": "text" if text.strip() else "needs_ocr"}


if __name__ == "__main__":
    try:
        request = json.loads(sys.stdin.buffer.read(8_000_000).decode("utf-8"))
        operation = request.get("operation")
        if operation == "train": result = train(request)
        elif operation == "render": result = render_document(request)
        elif operation == "parse": result = parse_document(request)
        else: raise ValueError("Unknown operation")
        sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8"))
    except Exception:
        sys.stdout.write(json.dumps({"error": "Engine operation failed. Check input or correct the document manually."}))
