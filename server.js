/**
 * Java Academy - Developer Dev Server with CMS API
 * Hosts files locally and supports POST APIs to write lessons directly to disk.
 * Zero-dependencies. Runs on Node.js.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// Helper: Parse POST request bodies as JSON
function parsePostBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    try {
      if (!body) {
        callback(null, {});
        return;
      }
      callback(null, JSON.parse(body));
    } catch (e) {
      callback(e, null);
    }
  });
}

// Helper: Ensure backup directories exist
function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Helper: Create backup version of file
function createBackup(originalPath, prefix) {
  try {
    if (fs.existsSync(originalPath)) {
      ensureDirExists('./content/backups');
      const content = fs.readFileSync(originalPath, 'utf8');
      const backupPath = `./content/backups/${prefix}_v${Date.now()}.json`;
      fs.writeFileSync(backupPath, content, 'utf8');
      console.log(`[Backup] Archiving version to: ${backupPath}`);
    }
  } catch (err) {
    console.error(`[Backup Error] Failed to backup ${originalPath}:`, err.message);
  }
}

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle CMS POST APIs
  if (req.method === 'POST') {
    if (req.url === '/api/save-lesson') {
      parsePostBody(req, (err, body) => {
        if (err || !body.course || !body.dayId || !body.data) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Invalid payload parameters.' }));
          return;
        }

        const course = body.course.replace(/[^a-zA-Z0-9_]/g, '');
        const dayId = body.dayId.replace(/[^a-zA-Z0-9_]/g, '');
        
        const targetDir = `./content/${course}`;
        const targetPath = `${targetDir}/${dayId}.json`;
        
        ensureDirExists(targetDir);
        
        // Backup before save
        createBackup(targetPath, `${course}_${dayId}`);
        
        fs.writeFile(targetPath, JSON.stringify(body.data, null, 2), 'utf8', (writeErr) => {
          if (writeErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Failed to write lesson file to disk.' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Lesson saved successfully.' }));
        });
      });
      return;
    }

    if (req.url === '/api/save-config') {
      parsePostBody(req, (err, body) => {
        if (err || !body.config) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Invalid config payload.' }));
          return;
        }

        const targetPath = './content/config.json';
        
        // Backup config before save
        createBackup(targetPath, 'config');

        fs.writeFile(targetPath, JSON.stringify(body.config, null, 2), 'utf8', (writeErr) => {
          if (writeErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Failed to write config file.' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Config saved successfully.' }));
        });
      });
      return;
    }

    if (req.url === '/api/duplicate-lesson') {
      parsePostBody(req, (err, body) => {
        if (err || !body.course || !body.sourceDayId || !body.targetDayId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Missing parameters.' }));
          return;
        }

        const course = body.course.replace(/[^a-zA-Z0-9_]/g, '');
        const sourceId = body.sourceDayId.replace(/[^a-zA-Z0-9_]/g, '');
        const targetId = body.targetDayId.replace(/[^a-zA-Z0-9_]/g, '');

        const sourcePath = `./content/${course}/${sourceId}.json`;
        const targetPath = `./content/${course}/${targetId}.json`;

        if (!fs.existsSync(sourcePath)) {
          // If source file doesn't exist, write a basic template
          const templateObj = { id: targetId, dayNum: parseInt(targetId.split('_')[1]) || 2, title: 'Duplicated Lesson', category: 'General', difficulty: 'Beginner', contentSlides: [], quizQuestions: [], interviewCards: [] };
          fs.writeFile(targetPath, JSON.stringify(templateObj, null, 2), 'utf8', (wErr) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Created default template (source was empty).' }));
          });
          return;
        }

        fs.readFile(sourcePath, 'utf8', (readErr, content) => {
          if (readErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Failed to read source lesson file.' }));
            return;
          }

          try {
            const data = JSON.parse(content);
            data.id = targetId;
            data.dayNum = parseInt(targetId.split('_')[1]) || data.dayNum;
            
            fs.writeFile(targetPath, JSON.stringify(data, null, 2), 'utf8', (writeErr) => {
              if (writeErr) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Failed to write duplicated file.' }));
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, message: 'Lesson duplicated successfully.' }));
            });
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Source file contains invalid JSON.' }));
          }
        });
      });
      return;
    }
  }

  // Handle standard GET static requests
  let filePath = '.' + req.url;
  if (filePath === './' || filePath === './index.html') {
    filePath = './index.html';
  }

  const resolvedPath = path.resolve(filePath);
  const rootPath = path.resolve('.');

  if (!resolvedPath.startsWith(rootPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden: Directory traversal blocked.');
    return;
  }

  fs.stat(resolvedPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: File does not exist.');
      return;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(resolvedPath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error.');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log('\n==================================================');
  console.log('🚀  JAVA ACADEMY LMS + CMS SERVER RUNNING');
  console.log(`🔗  Access URL: http://localhost:${PORT}`);
  console.log('==================================================');
  console.log('👉 Open your browser and navigate to http://localhost:5000');
  console.log('👉 Press Ctrl+C in this terminal window to stop the server.\n');
});
