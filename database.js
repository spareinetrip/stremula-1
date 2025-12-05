const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'stremula.db');

// Initialize database
function initDatabase() {
    return new Promise((resolve, reject) => {
        // Ensure directory exists
        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ Error opening database:', err);
                reject(err);
                return;
            }
            console.log('✅ Connected to SQLite database');
        });

        // Create tables
        db.serialize(() => {
            // Table for processed posts (tracks which posts have been fully processed)
            db.run(`
                CREATE TABLE IF NOT EXISTS processed_posts (
                    post_id TEXT PRIMARY KEY,
                    post_url TEXT NOT NULL,
                    title TEXT NOT NULL,
                    quality TEXT NOT NULL,
                    grand_prix_name TEXT NOT NULL,
                    grand_prix_round INTEGER NOT NULL,
                    created_utc INTEGER NOT NULL,
                    processed_at INTEGER NOT NULL,
                    is_fully_processed INTEGER DEFAULT 0,
                    magnet_link TEXT,
                    torrent_id TEXT,
                    torrent_status TEXT,
                    torrent_last_checked INTEGER,
                    UNIQUE(post_id, quality)
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Error creating processed_posts table:', err);
                    reject(err);
                }
            });

            // Table for F1 weekends (stores all weekend data)
            db.run(`
                CREATE TABLE IF NOT EXISTS f1_weekends (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    grand_prix_name TEXT NOT NULL,
                    grand_prix_round INTEGER NOT NULL,
                    country TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE(grand_prix_name, grand_prix_round)
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Error creating f1_weekends table:', err);
                    reject(err);
                }
            });

            // Table for sessions (stores individual session data)
            db.run(`
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    weekend_id INTEGER NOT NULL,
                    session_name TEXT NOT NULL,
                    session_display_name TEXT NOT NULL,
                    session_date TEXT,
                    session_duration TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (weekend_id) REFERENCES f1_weekends(id),
                    UNIQUE(weekend_id, session_name)
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Error creating sessions table:', err);
                    reject(err);
                }
            });

            // Table for streaming links (stores Real Debrid links for each session)
            db.run(`
                CREATE TABLE IF NOT EXISTS streaming_links (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    quality TEXT NOT NULL,
                    url TEXT NOT NULL,
                    filename TEXT,
                    size INTEGER,
                    source TEXT DEFAULT 'Sky F1',
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id),
                    UNIQUE(session_id, quality, url)
                )
            `, (err) => {
                if (err) {
                    console.error('❌ Error creating streaming_links table:', err);
                    reject(err);
                } else {
                    // Migrate existing processed_posts table to add new columns if needed
                    db.run(`ALTER TABLE processed_posts ADD COLUMN torrent_id TEXT`, (err) => {
                        // Ignore error if column already exists
                    });
                    db.run(`ALTER TABLE processed_posts ADD COLUMN torrent_status TEXT`, (err) => {
                        // Ignore error if column already exists
                    });
                    db.run(`ALTER TABLE processed_posts ADD COLUMN torrent_last_checked INTEGER`, (err) => {
                        // Ignore error if column already exists
                        console.log('✅ Database tables initialized');
                        resolve(db);
                    });
                }
            });
        });
    });
}

// Get database instance
function getDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(db);
            }
        });
    });
}

// Check if a post is already processed
function isPostProcessed(postId, quality) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.get(
                'SELECT is_fully_processed FROM processed_posts WHERE post_id = ? AND quality = ?',
                [postId, quality],
                (err, row) => {
                    db.close();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row ? row.is_fully_processed === 1 : false);
                    }
                }
            );
        }).catch(reject);
    });
}

// Check if a weekend is fully processed (both 1080p and 2160p posts are fully processed)
function isWeekendFullyProcessed(grandPrixName, grandPrixRound) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            // Get all posts for this weekend
            db.all(
                `SELECT quality, is_fully_processed FROM processed_posts 
                 WHERE grand_prix_name = ? AND grand_prix_round = ?`,
                [grandPrixName, grandPrixRound],
                (err, rows) => {
                    db.close();
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Check if we have both 1080p and 2160p posts
                    const has1080p = rows.some(r => r.quality === '1080p');
                    const has2160p = rows.some(r => r.quality === '4K' || r.quality === '2160p');
                    
                    // Both qualities must exist and be fully processed
                    const fullyProcessed1080p = rows.some(r => r.quality === '1080p' && r.is_fully_processed === 1);
                    const fullyProcessed2160p = rows.some(r => (r.quality === '4K' || r.quality === '2160p') && r.is_fully_processed === 1);

                    resolve({
                        fullyProcessed: (has1080p && has2160p && fullyProcessed1080p && fullyProcessed2160p),
                        has1080p,
                        has2160p,
                        fullyProcessed1080p,
                        fullyProcessed2160p
                    });
                }
            );
        }).catch(reject);
    });
}

// Mark a post as processed (but not necessarily fully processed)
function markPostProcessed(postData) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.run(
                `INSERT OR REPLACE INTO processed_posts 
                 (post_id, post_url, title, quality, grand_prix_name, grand_prix_round, created_utc, processed_at, is_fully_processed, magnet_link, torrent_id, torrent_status, torrent_last_checked)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    postData.postId,
                    postData.postUrl,
                    postData.title,
                    postData.quality,
                    postData.grandPrixName,
                    postData.grandPrixRound,
                    postData.createdUtc,
                    Date.now(),
                    postData.isFullyProcessed ? 1 : 0,
                    postData.magnetLink || null,
                    postData.torrentId || null,
                    postData.torrentStatus || null,
                    postData.torrentLastChecked || null
                ],
                function(err) {
                    db.close();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        }).catch(reject);
    });
}

// Mark a post as fully processed (all sessions found and converted)
function markPostFullyProcessed(postId, quality) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.run(
                'UPDATE processed_posts SET is_fully_processed = 1 WHERE post_id = ? AND quality = ?',
                [postId, quality],
                function(err) {
                    db.close();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes > 0);
                    }
                }
            );
        }).catch(reject);
    });
}

// Save or update F1 weekend
function saveWeekend(weekendData) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            // First, try to get existing weekend to preserve its ID
            // This is critical: we must preserve the weekend_id so sessions and streaming links don't get orphaned
            db.get(
                'SELECT id, created_at FROM f1_weekends WHERE grand_prix_name = ? AND grand_prix_round = ?',
                [weekendData.name, weekendData.round],
                (err, existingWeekend) => {
                    if (err) {
                        db.close();
                        reject(err);
                        return;
                    }
                    
                    if (existingWeekend) {
                        // Weekend exists - UPDATE it to preserve the weekend_id
                        db.run(
                            `UPDATE f1_weekends 
                             SET country = ?, updated_at = ?
                             WHERE id = ?`,
                            [
                                weekendData.country,
                                Date.now(),
                                existingWeekend.id
                            ],
                            function(updateErr) {
                                if (updateErr) {
                                    db.close();
                                    reject(updateErr);
                                    return;
                                }
                                db.close();
                                resolve(existingWeekend.id);
                            }
                        );
                    } else {
                        // Weekend doesn't exist - INSERT it
                        db.run(
                            `INSERT INTO f1_weekends (grand_prix_name, grand_prix_round, country, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?)`,
                            [
                                weekendData.name,
                                weekendData.round,
                                weekendData.country,
                                Date.now(),
                                Date.now()
                            ],
                            function(insertErr) {
                                if (insertErr) {
                                    db.close();
                                    reject(insertErr);
                                    return;
                                }
                                // Get the newly created weekend ID
                                db.get(
                                    'SELECT id FROM f1_weekends WHERE grand_prix_name = ? AND grand_prix_round = ?',
                                    [weekendData.name, weekendData.round],
                                    (getErr, row) => {
                                        db.close();
                                        if (getErr) {
                                            reject(getErr);
                                        } else {
                                            resolve(row.id);
                                        }
                                    }
                                );
                            }
                        );
                    }
                }
            );
        }).catch(reject);
    });
}

// Save or update session
function saveSession(weekendId, sessionData) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            // First, try to get existing session to preserve its ID
            db.get(
                'SELECT id, created_at FROM sessions WHERE weekend_id = ? AND session_name = ?',
                [weekendId, sessionData.name],
                (err, existingSession) => {
                    if (err) {
                        db.close();
                        reject(err);
                        return;
                    }
                    
                    if (existingSession) {
                        // Session exists - UPDATE it to preserve the session_id
                        // This is critical: we must preserve the session_id so streaming links don't get orphaned
                        db.run(
                            `UPDATE sessions 
                             SET session_display_name = ?, session_date = ?, session_duration = ?, updated_at = ?
                             WHERE id = ?`,
                            [
                                sessionData.displayName,
                                sessionData.date || null,
                                sessionData.duration || null,
                                Date.now(),
                                existingSession.id
                            ],
                            function(updateErr) {
                                if (updateErr) {
                                    db.close();
                                    reject(updateErr);
                                    return;
                                }
                                db.close();
                                resolve(existingSession.id);
                            }
                        );
                    } else {
                        // Session doesn't exist - INSERT it
                        db.run(
                            `INSERT INTO sessions (weekend_id, session_name, session_display_name, session_date, session_duration, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                            [
                                weekendId,
                                sessionData.name,
                                sessionData.displayName,
                                sessionData.date || null,
                                sessionData.duration || null,
                                Date.now(),
                                Date.now()
                            ],
                            function(insertErr) {
                                if (insertErr) {
                                    db.close();
                                    reject(insertErr);
                                    return;
                                }
                                // Get the newly created session ID
                                db.get(
                                    'SELECT id FROM sessions WHERE weekend_id = ? AND session_name = ?',
                                    [weekendId, sessionData.name],
                                    (getErr, row) => {
                                        db.close();
                                        if (getErr) {
                                            reject(getErr);
                                        } else {
                                            resolve(row.id);
                                        }
                                    }
                                );
                            }
                        );
                    }
                }
            );
        }).catch(reject);
    });
}

// Save streaming link
function saveStreamingLink(sessionId, linkData) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.run(
                `INSERT OR IGNORE INTO streaming_links (session_id, quality, url, filename, size, source, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    sessionId,
                    linkData.quality,
                    linkData.url,
                    linkData.filename || null,
                    linkData.size || null,
                    linkData.source || 'Sky F1',
                    Date.now()
                ],
                function(err) {
                    db.close();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        }).catch(reject);
    });
}

// Get all weekends for Stremio catalog
function getAllWeekends() {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.all(
                `SELECT w.*, 
                 COUNT(DISTINCT s.id) as session_count,
                 COUNT(DISTINCT sl.id) as stream_count
                 FROM f1_weekends w
                 LEFT JOIN sessions s ON s.weekend_id = w.id
                 LEFT JOIN streaming_links sl ON sl.session_id = s.id
                 GROUP BY w.id
                 ORDER BY w.grand_prix_round DESC`,
                [],
                (err, rows) => {
                    db.close();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            );
        }).catch(reject);
    });
}

// Get all weekends with the same name (regardless of round) - used for year-based overwriting
function getWeekendsByName(grandPrixName) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.all(
                'SELECT * FROM f1_weekends WHERE grand_prix_name = ? ORDER BY grand_prix_round DESC',
                [grandPrixName],
                (err, rows) => {
                    db.close();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            );
        }).catch(reject);
    });
}

// Get the year that a weekend's posts are from (based on processed_posts created_utc timestamps)
// Returns the year (e.g., 2025, 2026) or null if no posts found
function getWeekendYear(grandPrixName, grandPrixRound) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            // Get all posts for this weekend
            db.all(
                `SELECT created_utc FROM processed_posts 
                 WHERE grand_prix_name = ? AND grand_prix_round = ?`,
                [grandPrixName, grandPrixRound],
                (err, rows) => {
                    db.close();
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!rows || rows.length === 0) {
                        // No posts found, can't determine year
                        resolve(null);
                        return;
                    }
                    
                    // Convert Unix timestamps to years and find the most common year
                    // (or if all are from the same year, use that)
                    const yearCounts = {};
                    for (const row of rows) {
                        const date = new Date(row.created_utc * 1000);
                        const year = date.getFullYear();
                        yearCounts[year] = (yearCounts[year] || 0) + 1;
                    }
                    
                    // Find the year with the most posts (or if all are same year, that's the year)
                    let maxCount = 0;
                    let weekendYear = null;
                    for (const [year, count] of Object.entries(yearCounts)) {
                        if (count > maxCount) {
                            maxCount = count;
                            weekendYear = parseInt(year);
                        }
                    }
                    
                    resolve(weekendYear);
                }
            );
        }).catch(reject);
    });
}

// Check if a weekend's posts are from a specific year (for backward compatibility)
function isWeekendFrom2025(grandPrixName, grandPrixRound) {
    return getWeekendYear(grandPrixName, grandPrixRound).then(year => year === 2025);
}

// Get weekend with all sessions and streams
function getWeekendWithSessions(grandPrixName) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            // Get weekend
            db.get(
                'SELECT * FROM f1_weekends WHERE grand_prix_name = ?',
                [grandPrixName],
                (err, weekend) => {
                    if (err) {
                        db.close();
                        reject(err);
                        return;
                    }
                    if (!weekend) {
                        db.close();
                        resolve(null);
                        return;
                    }

                    // Get sessions
                    db.all(
                        'SELECT * FROM sessions WHERE weekend_id = ? ORDER BY id',
                        [weekend.id],
                        (err, sessions) => {
                            if (err) {
                                db.close();
                                reject(err);
                                return;
                            }

                            // Get streaming links for each session
                            const sessionPromises = sessions.map(session => {
                                return new Promise((resolveSession, rejectSession) => {
                                    db.all(
                                        'SELECT * FROM streaming_links WHERE session_id = ?',
                                        [session.id],
                                        (err, links) => {
                                            if (err) {
                                                rejectSession(err);
                                            } else {
                                                resolveSession({ ...session, streams: links });
                                            }
                                        }
                                    );
                                });
                            });

                            Promise.all(sessionPromises).then(sessionsWithStreams => {
                                db.close();
                                resolve({
                                    ...weekend,
                                    sessions: sessionsWithStreams
                                });
                            }).catch(reject);
                        }
                    );
                }
            );
        }).catch(reject);
    });
}

// Get the most recent processed post timestamp for a weekend
function getMostRecentPostTimestamp(grandPrixName, grandPrixRound) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.get(
                `SELECT MAX(created_utc) as max_timestamp FROM processed_posts 
                 WHERE grand_prix_name = ? AND grand_prix_round = ?`,
                [grandPrixName, grandPrixRound],
                (err, row) => {
                    db.close();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row?.max_timestamp || 0);
                    }
                }
            );
        }).catch(reject);
    });
}

// Reset processed posts cache (allows re-processing of posts)
function resetProcessedPosts(grandPrixName = null, grandPrixRound = null) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            let query;
            let params;
            
            if (grandPrixName && grandPrixRound) {
                // Reset specific GP with specific round
                query = 'DELETE FROM processed_posts WHERE grand_prix_name = ? AND grand_prix_round = ?';
                params = [grandPrixName, grandPrixRound];
            } else if (grandPrixName) {
                // Reset all posts for a specific GP (all rounds)
                query = 'DELETE FROM processed_posts WHERE grand_prix_name = ?';
                params = [grandPrixName];
            } else {
                // Reset all processed posts (no parameters provided)
                query = 'DELETE FROM processed_posts';
                params = [];
            }
            
            db.run(query, params, function(err) {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
        }).catch(reject);
    });
}

// Reset all data for a specific GP (posts, weekend, sessions, streaming links)
function resetGrandPrix(grandPrixName, grandPrixRound) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.serialize(() => {
                // First, get the weekend ID
                db.get(
                    'SELECT id FROM f1_weekends WHERE grand_prix_name = ? AND grand_prix_round = ?',
                    [grandPrixName, grandPrixRound],
                    (err, weekend) => {
                        if (err) {
                            db.close();
                            reject(err);
                            return;
                        }
                        
                        if (!weekend) {
                            // Weekend doesn't exist, just delete processed posts
                            db.run(
                                'DELETE FROM processed_posts WHERE grand_prix_name = ? AND grand_prix_round = ?',
                                [grandPrixName, grandPrixRound],
                                function(err) {
                                    db.close();
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve({ postsDeleted: this.changes, weekendDeleted: 0, sessionsDeleted: 0, linksDeleted: 0 });
                                    }
                                }
                            );
                            return;
                        }
                        
                        const weekendId = weekend.id;
                        
                        // Get all session IDs for this weekend
                        db.all(
                            'SELECT id FROM sessions WHERE weekend_id = ?',
                            [weekendId],
                            (err, sessions) => {
                                if (err) {
                                    db.close();
                                    reject(err);
                                    return;
                                }
                                
                                const sessionIds = sessions.map(s => s.id);
                                let linksDeleted = 0;
                                
                                // Delete streaming links for all sessions
                                if (sessionIds.length > 0) {
                                    const placeholders = sessionIds.map(() => '?').join(',');
                                    db.run(
                                        `DELETE FROM streaming_links WHERE session_id IN (${placeholders})`,
                                        sessionIds,
                                        function(err) {
                                            if (err) {
                                                db.close();
                                                reject(err);
                                                return;
                                            }
                                            linksDeleted = this.changes;
                                            
                                            // Delete sessions
                                            db.run(
                                                'DELETE FROM sessions WHERE weekend_id = ?',
                                                [weekendId],
                                                function(err) {
                                                    if (err) {
                                                        db.close();
                                                        reject(err);
                                                        return;
                                                    }
                                                    const sessionsDeleted = this.changes;
                                                    
                                                    // Delete weekend
                                                    db.run(
                                                        'DELETE FROM f1_weekends WHERE id = ?',
                                                        [weekendId],
                                                        function(err) {
                                                            if (err) {
                                                                db.close();
                                                                reject(err);
                                                                return;
                                                            }
                                                            const weekendDeleted = this.changes;
                                                            
                                                            // Delete processed posts
                                                            db.run(
                                                                'DELETE FROM processed_posts WHERE grand_prix_name = ? AND grand_prix_round = ?',
                                                                [grandPrixName, grandPrixRound],
                                                                function(err) {
                                                                    db.close();
                                                                    if (err) {
                                                                        reject(err);
                                                                    } else {
                                                                        resolve({
                                                                            postsDeleted: this.changes,
                                                                            weekendDeleted,
                                                                            sessionsDeleted,
                                                                            linksDeleted
                                                                        });
                                                                    }
                                                                }
                                                            );
                                                        }
                                                    );
                                                }
                                            );
                                        }
                                    );
                                } else {
                                    // No sessions, just delete weekend and posts
                                    db.run(
                                        'DELETE FROM f1_weekends WHERE id = ?',
                                        [weekendId],
                                        function(err) {
                                            if (err) {
                                                db.close();
                                                reject(err);
                                                return;
                                            }
                                            const weekendDeleted = this.changes;
                                            
                                            db.run(
                                                'DELETE FROM processed_posts WHERE grand_prix_name = ? AND grand_prix_round = ?',
                                                [grandPrixName, grandPrixRound],
                                                function(err) {
                                                    db.close();
                                                    if (err) {
                                                        reject(err);
                                                    } else {
                                                        resolve({
                                                            postsDeleted: this.changes,
                                                            weekendDeleted,
                                                            sessionsDeleted: 0,
                                                            linksDeleted: 0
                                                        });
                                                    }
                                                }
                                            );
                                        }
                                    );
                                }
                            }
                        );
                    }
                );
            });
        }).catch(reject);
    });
}

// Check if a magnet link was recently attempted and is still downloading
// Returns true if we should skip (recently attempted and still downloading)
function shouldSkipMagnetLink(magnetLink, minWaitMinutes = 30) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.get(
                `SELECT torrent_status, torrent_last_checked FROM processed_posts 
                 WHERE magnet_link = ? AND torrent_status IS NOT NULL 
                 ORDER BY torrent_last_checked DESC LIMIT 1`,
                [magnetLink],
                (err, row) => {
                    db.close();
                    if (err) {
                        reject(err);
                    } else if (!row) {
                        // No previous attempt, don't skip
                        resolve(false);
                    } else {
                        const lastChecked = row.torrent_last_checked || 0;
                        const minutesSinceCheck = (Date.now() - lastChecked) / (1000 * 60);
                        const isStillDownloading = row.torrent_status === 'downloading' || 
                                                   row.torrent_status === 'queued' ||
                                                   row.torrent_status === 'processing';
                        
                        // Skip if still downloading and checked recently (within minWaitMinutes)
                        resolve(isStillDownloading && minutesSinceCheck < minWaitMinutes);
                    }
                }
            );
        }).catch(reject);
    });
}

// Update torrent status for a post
function updateTorrentStatus(postId, quality, torrentId, torrentStatus) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.run(
                `UPDATE processed_posts 
                 SET torrent_id = ?, torrent_status = ?, torrent_last_checked = ?
                 WHERE post_id = ? AND quality = ?`,
                [torrentId, torrentStatus, Date.now(), postId, quality],
                function(err) {
                    db.close();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(this.changes > 0);
                    }
                }
            );
        }).catch(reject);
    });
}

// Get torrent info for a post by magnet link
function getTorrentInfoByMagnet(magnetLink) {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.get(
                `SELECT post_id, quality, torrent_id, torrent_status, torrent_last_checked 
                 FROM processed_posts 
                 WHERE magnet_link = ? AND torrent_id IS NOT NULL
                 ORDER BY torrent_last_checked DESC LIMIT 1`,
                [magnetLink],
                (err, row) => {
                    db.close();
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row || null);
                    }
                }
            );
        }).catch(reject);
    });
}

// Reset all cache/data (nuclear option)
function resetAll() {
    return new Promise((resolve, reject) => {
        getDatabase().then(db => {
            db.serialize(() => {
                db.run('DELETE FROM streaming_links', [], function(err) {
                    if (err) {
                        db.close();
                        reject(err);
                        return;
                    }
                    const linksDeleted = this.changes;
                    
                    db.run('DELETE FROM sessions', [], function(err) {
                        if (err) {
                            db.close();
                            reject(err);
                            return;
                        }
                        const sessionsDeleted = this.changes;
                        
                        db.run('DELETE FROM f1_weekends', [], function(err) {
                            if (err) {
                                db.close();
                                reject(err);
                                return;
                            }
                            const weekendsDeleted = this.changes;
                            
                            db.run('DELETE FROM processed_posts', [], function(err) {
                                db.close();
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve({
                                        postsDeleted: this.changes,
                                        weekendsDeleted,
                                        sessionsDeleted,
                                        linksDeleted
                                    });
                                }
                            });
                        });
                    });
                });
            });
        }).catch(reject);
    });
}

module.exports = {
    initDatabase,
    getDatabase,
    isPostProcessed,
    isWeekendFullyProcessed,
    markPostProcessed,
    markPostFullyProcessed,
    saveWeekend,
    saveSession,
    saveStreamingLink,
    getAllWeekends,
    getWeekendsByName,
    getWeekendYear,
    isWeekendFrom2025,
    getWeekendWithSessions,
    getMostRecentPostTimestamp,
    resetProcessedPosts,
    resetGrandPrix,
    resetAll,
    shouldSkipMagnetLink,
    updateTorrentStatus,
    getTorrentInfoByMagnet
};

