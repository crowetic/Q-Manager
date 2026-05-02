import React, { useState } from "react";
import {
  Box,
  ButtonBase,
  CircularProgress,
  MenuItem,
  Select,
  Typography,
  styled,
} from "@mui/material";
import ShortUniqueId from "short-unique-id";
import { fileToBase64, objectToBase64 } from "../utils";
import { openToast } from "../components/openToast";
import Button from "../components/Button";
import { privateServices, services } from "../constants";
import { useDropzone } from "react-dropzone"; 
import { requestQortal } from "../qapp/request";
import { upsertPrivateResourceIndexEntry } from "../storage";

const uid = new ShortUniqueId({ length: 10 });

const normalizeEncryptedSharingKeyResponse = (response) => {
  if (response === null || response === undefined) {
    return {
      data64: "",
      sharingKey: "",
      publicKey: "",
    };
  }

  if (typeof response === "string") {
    const trimmed = response.trim();
    if (!trimmed) {
      return {
        data64: "",
        sharingKey: "",
        publicKey: "",
      };
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return {
          data64:
            parsed?.data64 ||
            parsed?.data ||
            parsed?.encryptedData ||
            parsed?.payload ||
            "",
          sharingKey: parsed?.key || parsed?.sharingKey || "",
          publicKey: parsed?.publicKey || "",
          raw: parsed,
        };
      }
    } catch (error) {}

    return {
      data64: trimmed,
      sharingKey: "",
      publicKey: "",
      raw: response,
    };
  }

  if (typeof response === "object") {
    return {
      data64:
        response?.data64 ||
        response?.data ||
        response?.encryptedData ||
        response?.payload ||
        "",
      sharingKey: response?.key || response?.sharingKey || "",
      publicKey: response?.publicKey || "",
      raw: response,
    };
  }

  return {
    data64: String(response),
    sharingKey: "",
    publicKey: "",
    raw: response,
  };
};

const buildEncryptedResourcePayload = async ({ data64, filename, file }) => {
  return objectToBase64({
    qManagerEncryptedResource: true,
    version: 1,
    data: data64,
    metadata: {
      filename,
      displayName: filename,
      mimeType: file?.type || "application/octet-stream",
      sizeInBytes: Number(file?.size) || 0,
    },
  });
};

export const Label = styled("label")`
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 14px;
  display: block;
  margin-bottom: 4px;
  font-weight: 400;
`;

export const PUBLISH_MULTIPLE_QDN_RESOURCES = ({
  files: initialFiles = [],
  addNodeByPath,
  myName,
  accountAddress,
  accountPublicKey,
  mode,
  groups,
  selectedGroup,
}) => {
  const [files, setFiles] = useState(initialFiles);
  const [requestData, setRequestData] = useState({
    service: mode === "private" ? "DOCUMENT_PRIVATE" : "DOCUMENT",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState("");
  const ownerName = typeof myName === "string" ? myName : "";

  const { getRootProps, getInputProps } = useDropzone({
    multiple: true,
    onDrop: (acceptedFiles) => {
      // append new files to state
      setFiles((prev) => [...prev, ...acceptedFiles]);
    },
  });

  // Utility: derive filename parts & identifier
  const makeMeta = (file) => {
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()
      : "";
    const title = file.name
      .split(".")
      .slice(0, -1)
      .join(".")
      .replace(/\s+/g, "_")
      .slice(0, 20) || "untitled";
    const filename = ext ? `${title}.${ext}` : title;
    const prefix =
      mode === "public"
        ? "pub"
        : mode === "private"
        ? "pvt"
        : `grp-${selectedGroup}`;
    const identifier =
      mode === "public"
        ? `${prefix}-q-manager-${title.toLowerCase()}`
        : `${prefix}-q-manager-${uid.rnd()}`;
    return { filename, identifier };
  };

  const executeMulti = async () => {
    const promise = (async () => {
      if (mode === "group" && !selectedGroup)
        throw new Error("Please select a group");
      if (!requestData?.service) throw new Error("Please select a service");
      const resolvedOwnerName = await resolvePreferredName(ownerName);
      if (!resolvedOwnerName) throw new Error("Could not determine Qortal name");
      setIsLoading(true);

      // 1) build resources array
      const resources = [];
      const publishedItems = [];
      for (const file of files) {
        const { filename, identifier } = makeMeta(file);
        const data64 = await fileToBase64(file);
        const mimeType = file?.type || "application/octet-stream";
        const sizeInBytes = Number(file?.size) || 0;
        const publishedItem = {
          file,
          filename,
          identifier,
          mimeType,
          sizeInBytes,
        };
        publishedItems.push(publishedItem);

        if (mode === "group") {
          // group‐encrypt
          const encryptedPayload = await buildEncryptedResourcePayload({
            data64,
            filename,
            file,
          });
          const encrypted = await requestQortal({
            action: "ENCRYPT_QORTAL_GROUP_DATA",
            data64: encryptedPayload,
            groupId: selectedGroup,
          });
          resources.push({
            name: myName,
            service: requestData.service,
            identifier,
            mimeType,
            data64: encrypted,
            externalEncrypt: true,
          });
        } else if (mode === "private") {
          // private‐encrypt
          const encryptedPayload = await buildEncryptedResourcePayload({
            data64,
            filename,
            file,
          });
          const encryptedResponse = await requestQortal({
            action: "ENCRYPT_DATA_WITH_SHARING_KEY",
            data64: encryptedPayload,
          });
          const {
            data64: encrypted,
            sharingKey,
            publicKey,
          } = normalizeEncryptedSharingKeyResponse(encryptedResponse);
          resources.push({
            name: myName,
            service: requestData.service,
            identifier,
            mimeType,
            data64: encrypted,
          });
          publishedItem.sharingKey = sharingKey;
          publishedItem.publicKey = accountPublicKey || publicKey;
        } else {
          // public
          resources.push({
            name: myName,
            service: requestData.service,
            identifier,
            filename,
            mimeType,
            file, // raw File object
          });
        }
      }

      // 2) send multi-publish request
      const result = await requestQortal({
        action: "PUBLISH_MULTIPLE_QDN_RESOURCES",
        name: resolvedOwnerName,
        resources,
      });

      if (!result || result?.error) {
        throw new Error(result?.error || "Unable to publish the files");
      }

      // 3) update tree exactly like single publish
      const indexOwner = accountAddress || myName;
      for (const item of publishedItems) {
        const groupEntry =
          mode === "group"
            ? {
                group: selectedGroup,
                groupName: groups?.find((g) => g.groupId === selectedGroup)?.groupName,
              }
            : {};

        addNodeByPath(undefined, {
          type: "file",
          name: item.filename,
          displayName: item.filename,
          mimeType: item.mimeType,
          ...(item.sizeInBytes !== undefined ? { sizeInBytes: item.sizeInBytes } : {}),
          qortalName: myName,
          identifier: item.identifier,
          service: requestData.service,
          ...(item.sharingKey ? { sharingKey: item.sharingKey } : {}),
          ...(item.publicKey ? { publicKey: item.publicKey } : {}),
          ...groupEntry,
        });

        if (mode !== "public") {
          await upsertPrivateResourceIndexEntry(indexOwner, {
            resourceKey: [
              accountAddress || myName || indexOwner || "",
              requestData.service || "",
              item.identifier || "",
              selectedGroup || 0,
            ].join("|"),
            qortalName: myName,
            service: requestData.service,
            identifier: item.identifier,
            filename: item.filename,
            displayName: item.filename,
            mimeType: item.mimeType,
            sizeInBytes: item.sizeInBytes,
            encryptionType: mode === "group" ? "group" : "private",
            ...(item.sharingKey ? { sharingKey: item.sharingKey } : {}),
            ...(item.publicKey ? { publicKey: item.publicKey } : {}),
            ...(mode === "group"
              ? {
                  group: selectedGroup,
                  groupId: selectedGroup,
                  groupName: groups?.find((g) => g.groupId === selectedGroup)?.groupName,
                }
              : {}),
          });
        }
      }

      setFiles([]); // clear selection
      return result;
    })();

    await openToast(promise, {
      loading: "Publishing files...",
      success: "All files published!",
      error: (e) => `Publish failed: ${e.message || e.error || e}`,
    });

    try {
      const final = await promise;
      setResponse(JSON.stringify(final, null, 2));
    } catch (e) {
      setResponse(JSON.stringify(e, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ mb: 2, display: "flex", gap: 2, alignItems: "center" }}>
        <Box>
          <Label>Service</Label>
          <Select
            size="small"
            value={requestData.service}
            onChange={(e) =>
              setRequestData((p) => ({ ...p, service: e.target.value }))
            }
            sx={{ width: 200 }}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: "#1f2530",
                  color: "#ffffff",
                  backgroundImage: "none",
                  maxHeight: 380,
                },
              },
            }}
          >
            {(mode === "private" ? privateServices : services).map((s) => (
              <MenuItem key={s.name} value={s.name}>
                {s.name} (max {s.sizeLabel})
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box
          {...getRootProps()}
          sx={{
            mb: 2,
            p: 2,
            border: "2px dashed #555",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <input {...getInputProps()} />
          <Typography>
            Click or drag files here to add more ({files.length})
          </Typography>
        </Box>
        <Typography>
          {files.length} file{files.length !== 1 ? "s" : ""} selected:
        </Typography>
        <ul>
          {files.map((f, i) => (
            <li key={i}>
              {f.name}{" "}
              <ButtonBase
                onClick={() =>
                  setFiles((prev) => prev.filter((_, idx) => idx !== i))
                }
              >
                Remove
              </ButtonBase>
            </li>
          ))}
        </ul>
      </Box>

      <Button
        name="Publish all"
        bgColor="#309ed1"
        onClick={executeMulti}
        disabled={files.length === 0 || isLoading}
      />

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6">Response</Typography>
        {isLoading ? (
          <CircularProgress />
        ) : (
          <Box
            component="pre"
            sx={{ background: "#222", color: "#ddd", p: 2, borderRadius: 2 }}
          >
            {response}
          </Box>
        )}
      </Box>
    </Box>
  );
};
