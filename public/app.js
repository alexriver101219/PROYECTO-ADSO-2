const state = {
  token: localStorage.getItem("portalToken") ?? "",
  user: null,
  requests: [],
  selectedRequestId: null,
  history: [],
  attachments: [],
};

const ui = {
  loginTab: document.getElementById("loginTab"),
  registerTab: document.getElementById("registerTab"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  registerName: document.getElementById("registerName"),
  registerEmail: document.getElementById("registerEmail"),
  registerPassword: document.getElementById("registerPassword"),
  sessionBadge: document.getElementById("sessionBadge"),
  sessionCard: document.getElementById("sessionCard"),
  currentUserName: document.getElementById("currentUserName"),
  currentUserMeta: document.getElementById("currentUserMeta"),
  logoutButton: document.getElementById("logoutButton"),
  requestForm: document.getElementById("requestForm"),
  requestTitle: document.getElementById("requestTitle"),
  requestCategory: document.getElementById("requestCategory"),
  requestDescription: document.getElementById("requestDescription"),
  requestList: document.getElementById("requestList"),
  requestCount: document.getElementById("requestCount"),
  filtersPanel: document.getElementById("filtersPanel"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  detailCard: document.getElementById("detailCard"),
  detailHint: document.getElementById("detailHint"),
  messageBanner: document.getElementById("messageBanner"),
  refreshButton: document.getElementById("refreshButton"),
};

function setMessage(text, isError = false) {
  ui.messageBanner.textContent = text;
  ui.messageBanner.classList.remove("hidden", "error");
  if (isError) {
    ui.messageBanner.classList.add("error");
  }
  window.clearTimeout(setMessage.timerId);
  setMessage.timerId = window.setTimeout(() => {
    ui.messageBanner.classList.add("hidden");
  }, 3400);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" && payload?.message
      ? payload.message
      : "Request failed.";
    throw new Error(message);
  }

  return payload;
}

function saveSession(token) {
  state.token = token;
  localStorage.setItem("portalToken", token);
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.requests = [];
  state.selectedRequestId = null;
  state.history = [];
  state.attachments = [];
  localStorage.removeItem("portalToken");
  render();
}

function formatDate(value) {
  return new Date(value).toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function requestStatusPill(status) {
  return `<span class="status-pill ${status}">${status.replaceAll("_", " ")}</span>`;
}

function selectedRequest() {
  return state.requests.find((item) => item.id === state.selectedRequestId) ?? null;
}

async function fetchMe() {
  if (!state.token) {
    return;
  }

  try {
    state.user = await api("/auth/me");
  } catch (error) {
    clearSession();
    throw error;
  }
}

async function fetchRequests() {
  if (!state.user) {
    return;
  }

  const params = new URLSearchParams();
  if (ui.searchInput.value.trim()) {
    params.set("search", ui.searchInput.value.trim());
  }
  if (ui.statusFilter.value) {
    params.set("status", ui.statusFilter.value);
  }

  const query = params.toString();
  state.requests = await api(`/requests${query ? `?${query}` : ""}`);

  if (!state.requests.length) {
    state.selectedRequestId = null;
    state.history = [];
    state.attachments = [];
    return;
  }

  if (!state.selectedRequestId || !state.requests.some((item) => item.id === state.selectedRequestId)) {
    state.selectedRequestId = state.requests[0].id;
  }

  await fetchRequestDetail();
}

async function fetchRequestDetail() {
  const current = selectedRequest();
  if (!current || !state.user) {
    state.history = [];
    state.attachments = [];
    return;
  }

  const [history, attachments] = await Promise.all([
    api(`/requests/${current.id}/history`),
    api(`/requests/${current.id}/attachments`),
  ]);

  state.history = history;
  state.attachments = attachments;
}

function availableActions() {
  const current = selectedRequest();
  if (!current || !state.user) {
    return [];
  }

  if (state.user.role === "ADMIN") {
    return ["IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"];
  }

  if (current.status === "PENDING" || current.status === "IN_REVIEW") {
    return ["CANCELLED"];
  }

  if (current.status === "APPROVED") {
    return ["COMPLETED"];
  }

  return [];
}

function renderAuth() {
  const loggedIn = Boolean(state.user);
  ui.sessionCard.classList.toggle("hidden", !loggedIn);
  ui.requestForm.classList.toggle("hidden", !loggedIn);
  ui.filtersPanel.classList.toggle("hidden", !loggedIn);
  ui.loginForm.classList.toggle("hidden", loggedIn || !ui.loginTab.classList.contains("active"));
  ui.registerForm.classList.toggle("hidden", loggedIn || !ui.registerTab.classList.contains("active"));

  if (!loggedIn) {
    ui.sessionBadge.textContent = "Sin sesion";
    ui.sessionBadge.className = "badge";
    return;
  }

  ui.sessionBadge.textContent = state.user.role;
  ui.sessionBadge.className = `badge ${state.user.role === "ADMIN" ? "admin" : ""}`.trim();
  ui.currentUserName.textContent = state.user.name;
  ui.currentUserMeta.textContent = `${state.user.email} � ${state.user.role}`;
}

function renderRequests() {
  if (!state.user) {
    ui.requestCount.textContent = "0 registros";
    ui.requestList.innerHTML = '<div class="empty-state">Inicia sesion para ver y gestionar solicitudes.</div>';
    return;
  }

  ui.requestCount.textContent = `${state.requests.length} registros`;

  if (!state.requests.length) {
    ui.requestList.innerHTML = '<div class="empty-state">No hay solicitudes para los filtros actuales.</div>';
    return;
  }

  ui.requestList.innerHTML = state.requests
    .map((item) => {
      const isActive = item.id === state.selectedRequestId ? "active" : "";
      return `
        <article class="request-item ${isActive}" data-request-id="${item.id}">
          <div class="request-head">
            <h3>${item.title}</h3>
            ${requestStatusPill(item.status)}
          </div>
          <p>${item.description}</p>
          <p class="meta">${item.category} � ${item.owner.name}</p>
          <p class="meta">${formatDate(item.createdAt)}</p>
        </article>
      `;
    })
    .join("");

  for (const element of ui.requestList.querySelectorAll("[data-request-id]")) {
    element.addEventListener("click", async () => {
      state.selectedRequestId = element.getAttribute("data-request-id");
      await fetchRequestDetail();
      render();
    });
  }
}

function renderDetail() {
  const current = selectedRequest();
  if (!current || !state.user) {
    ui.detailHint.textContent = "Sin seleccion";
    ui.detailCard.innerHTML = '<div class="empty-state">Selecciona una solicitud para ver historial, adjuntos y acciones.</div>';
    return;
  }

  ui.detailHint.textContent = current.id;
  const actions = availableActions();

  ui.detailCard.innerHTML = `
    <div class="detail-block">
      <div class="request-head">
        <div>
          <h3>${current.title}</h3>
          <p class="meta">${current.category} � ${current.owner.name}</p>
        </div>
        ${requestStatusPill(current.status)}
      </div>
      <p>${current.description}</p>
      <p class="meta">Creada: ${formatDate(current.createdAt)}</p>
      <p class="meta">Actualizada: ${formatDate(current.updatedAt)}</p>
    </div>

    <div class="detail-block">
      <h4>Acciones</h4>
      <div class="detail-actions">
        <form id="statusForm" class="inline-row ${actions.length ? "" : "hidden"}">
          <select id="statusSelect" required>
            <option value="">Cambiar estado</option>
            ${actions.map((status) => `<option value="${status}">${status}</option>`).join("")}
          </select>
          <input id="statusNote" type="text" placeholder="Nota opcional" maxlength="300" />
          <button class="accent-button" type="submit">Aplicar</button>
        </form>

        <form id="uploadForm" class="${state.user.role === "ADMIN" ? "" : "hidden"}">
          <label>
            Adjuntar archivo (PDF o imagen)
            <input id="attachmentInput" type="file" accept=".pdf,image/png,image/jpeg,image/webp" />
          </label>
          <button class="ghost-button" type="submit">Subir adjunto</button>
        </form>
      </div>
    </div>

    <div class="detail-block">
      <h4>Historial</h4>
      <div class="history-list">
        ${
          state.history.length
            ? state.history
                .map(
                  (entry) => `
                    <article>
                      <div class="history-head">
                        ${requestStatusPill(entry.toStatus)}
                        <span class="history-meta">${formatDate(entry.createdAt)}</span>
                      </div>
                      <p class="meta">Por ${entry.changedBy.name} (${entry.changedBy.email})</p>
                      <p class="meta">Origen: ${entry.fromStatus ?? "INITIAL"}</p>
                      ${entry.note ? `<p>${entry.note}</p>` : ""}
                    </article>
                  `,
                )
                .join("")
            : '<div class="empty-state">Sin movimientos registrados.</div>'
        }
      </div>
    </div>

    <div class="detail-block">
      <h4>Adjuntos</h4>
      <div class="attachment-list">
        ${
          state.attachments.length
            ? state.attachments
                .map(
                  (item) => `
                    <article>
                      <div class="attachment-head">
                        <strong>${item.originalName}</strong>
                        <button class="link-button" data-download-id="${item.id}" type="button">Descargar</button>
                      </div>
                      <p class="attachment-meta">${item.mimeType} � ${item.size} bytes</p>
                      <p class="attachment-meta">Subido por ${item.uploadedBy.name}</p>
                    </article>
                  `,
                )
                .join("")
            : '<div class="empty-state">Aun no hay adjuntos.</div>'
        }
      </div>
    </div>
  `;

  const statusForm = document.getElementById("statusForm");
  const uploadForm = document.getElementById("uploadForm");

  if (statusForm) {
    statusForm.addEventListener("submit", handleStatusUpdate);
  }

  if (uploadForm) {
    uploadForm.addEventListener("submit", handleAttachmentUpload);
  }

  for (const button of ui.detailCard.querySelectorAll("[data-download-id]")) {
    button.addEventListener("click", async () => {
      const attachmentId = button.getAttribute("data-download-id");
      await downloadAttachment(attachmentId);
    });
  }
}

function render() {
  renderAuth();
  renderRequests();
  renderDetail();
}

async function initializeSession() {
  if (!state.token) {
    render();
    return;
  }

  try {
    await fetchMe();
    await fetchRequests();
  } catch (error) {
    setMessage(error.message, true);
  }

  render();
}

async function handleLogin(event) {
  event.preventDefault();

  try {
    const payload = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: ui.loginEmail.value.trim(),
        password: ui.loginPassword.value,
      }),
    });

    saveSession(payload.token);
    state.user = payload.user;
    await fetchRequests();
    render();
    setMessage("Sesion iniciada correctamente.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleRegister(event) {
  event.preventDefault();

  try {
    const payload = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: ui.registerName.value.trim(),
        email: ui.registerEmail.value.trim(),
        password: ui.registerPassword.value,
      }),
    });

    saveSession(payload.token);
    state.user = payload.user;
    ui.registerForm.reset();
    await fetchRequests();
    render();
    setMessage("Cuenta creada y sesion iniciada.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleCreateRequest(event) {
  event.preventDefault();

  try {
    await api("/requests", {
      method: "POST",
      body: JSON.stringify({
        title: ui.requestTitle.value.trim(),
        category: ui.requestCategory.value.trim(),
        description: ui.requestDescription.value.trim(),
      }),
    });

    ui.requestForm.reset();
    await fetchRequests();
    render();
    setMessage("Solicitud creada.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleStatusUpdate(event) {
  event.preventDefault();
  const statusSelect = document.getElementById("statusSelect");
  const statusNote = document.getElementById("statusNote");
  const current = selectedRequest();

  if (!current) {
    return;
  }

  try {
    await api(`/requests/${current.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status: statusSelect.value,
        note: statusNote.value.trim() || undefined,
      }),
    });

    await fetchRequests();
    render();
    setMessage("Estado actualizado.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function handleAttachmentUpload(event) {
  event.preventDefault();
  const current = selectedRequest();
  const input = document.getElementById("attachmentInput");

  if (!current || !input.files?.length) {
    setMessage("Selecciona un archivo antes de subirlo.", true);
    return;
  }

  const formData = new FormData();
  formData.append("file", input.files[0]);

  try {
    await api(`/requests/${current.id}/attachments`, {
      method: "POST",
      body: formData,
      headers: {},
    });

    input.value = "";
    await fetchRequestDetail();
    render();
    setMessage("Adjunto subido.");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function downloadAttachment(attachmentId) {
  try {
    const response = await fetch(`/attachments/${attachmentId}/download`, {
      headers: {
        Authorization: `Bearer ${state.token}`,
      },
    });

    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.message || "No se pudo descargar el archivo.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const disposition = response.headers.get("content-disposition") || "";
    const fileName = disposition.split('filename="')[1]?.split('"')[0] || "archivo";
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    setMessage(error.message, true);
  }
}

ui.loginTab.addEventListener("click", () => {
  ui.loginTab.classList.add("active");
  ui.registerTab.classList.remove("active");
  renderAuth();
});

ui.registerTab.addEventListener("click", () => {
  ui.registerTab.classList.add("active");
  ui.loginTab.classList.remove("active");
  renderAuth();
});

ui.loginForm.addEventListener("submit", handleLogin);
ui.registerForm.addEventListener("submit", handleRegister);
ui.requestForm.addEventListener("submit", handleCreateRequest);
ui.logoutButton.addEventListener("click", () => {
  clearSession();
  setMessage("Sesion cerrada.");
});
ui.refreshButton.addEventListener("click", async () => {
  try {
    if (state.user) {
      await fetchRequests();
    }
    render();
    setMessage("Panel actualizado.");
  } catch (error) {
    setMessage(error.message, true);
  }
});
ui.searchInput.addEventListener("input", async () => {
  if (!state.user) {
    return;
  }
  await fetchRequests();
  render();
});
ui.statusFilter.addEventListener("change", async () => {
  if (!state.user) {
    return;
  }
  await fetchRequests();
  render();
});

initializeSession();
