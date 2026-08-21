/**
 * Code.gs — the RSVP + Questions backend.
 *
 * Paste this whole file into Extensions → Apps Script on the "Wedding
 * RSVPs" Google Sheet, then deploy it as a Web App (Execute as: Me,
 * Who has access: Anyone). Full steps are in the repo README.
 *
 * IMPORTANT — set the auth token before deploying:
 *   Project Settings (gear icon) → Script Properties → Add property
 *   Key: AUTH_TOKEN   Value: <the token printed by build-invites.mjs>
 *
 * The token itself is never committed to the public repo — it only lives
 * here as a Script Property (private to your Google account) and inside
 * each guest's encrypted bundle. A request that doesn't carry a matching
 * token is dropped, which keeps random bots hitting this public URL from
 * writing junk rows.
 */

var NOTIFY_EMAIL = "yusufkamilak@icloud.com";
var SHEET_NAME = "Responses";
var HEADERS = ["timestamp", "type", "name", "lang", "event", "attending", "dietary", "message"];

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return jsonResponse_({ ok: true, message: "Wedding RSVP endpoint is live." });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ ok: false, error: "empty request" });
    }

    var data = JSON.parse(e.postData.contents);

    var expectedToken = PropertiesService.getScriptProperties().getProperty("AUTH_TOKEN");
    if (!expectedToken || data.auth !== expectedToken) {
      // Wrong/missing token — most likely a bot that found the public
      // /exec URL, not a real guest. Drop it quietly.
      return jsonResponse_({ ok: false, error: "unauthorized" });
    }

    var type = data.type === "question" ? "question" : "rsvp";
    var name = String(data.name || "").slice(0, 200);
    var lang = String(data.lang || "").slice(0, 10);
    var event = String(data.event || "").slice(0, 10);
    var attending = String(data.attending || "").slice(0, 10);
    var dietary = String(data.dietary || "").slice(0, 500);
    var message = String(data.message || "").slice(0, 2000);

    var sheet = getSheet_();
    sheet.appendRow([new Date(), type, name, lang, event, attending, dietary, message]);

    sendNotification_(type, name, event, attending, dietary, message);

    return jsonResponse_({ ok: true });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function sendNotification_(type, name, event, attending, dietary, message) {
  var subject, body;
  if (type === "question") {
    subject = "Wedding site — question from " + name;
    body = "Name: " + name + "\nEvent: " + event + "\n\nQuestion:\n" + message;
  } else {
    subject = "Wedding site — RSVP from " + name + " (" + (attending === "yes" ? "attending" : "not attending") + ")";
    body =
      "Name: " + name +
      "\nEvent: " + event +
      "\nAttending: " + attending +
      "\nDietary: " + (dietary || "—") +
      "\n\nMessage:\n" + (message || "—");
  }
  try {
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } catch (err) {
    // Sheet row already saved even if the email quota is exhausted or
    // something else goes wrong here — don't let this fail the request.
  }
}
