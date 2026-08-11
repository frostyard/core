window.fyDocsProjects = {
  snosi: {
    label: "snosi", kicker: "Image build system",
    nav: [["Getting started", ["Overview", "Installation", "Quickstart"]], ["Concepts", ["Why atomic", "Images", "Extensions"]], ["Reference", ["mkosi profiles", "CI pipeline"]]],
    page: {
      title: "Why atomic",
      toc: ["Your OS as an image", "Atomic updates and rollbacks", "No configuration drift"],
      sections: [
        ["Your OS as an image", "Snosi applies the container model to the entire operating system. Images are defined with mkosi, built in CI, published to a repository, and deployed to bare metal, VMs, or the cloud. There is no divide between how you build application containers and how you build the host they run on.", { code: "mkosi --profile snow build" }],
        ["Atomic updates and rollbacks", "Updates are transactional. A new OS image downloads in the background while the current system runs uninterrupted. On reboot, the system switches to the new deployment atomically — the update either applies completely, or not at all. The previous working image is always preserved.", { callout: ["Rollback", "If an update causes problems, select the prior deployment from the boot menu. The two-image model means even catastrophic update failures cannot brick a system."] }],
        ["No configuration drift", "The root filesystem is read-only. Only /etc and /var are writable. Every machine running the same image is provably identical in its system files; changes are committed to the image definition, not applied as undocumented one-off fixes.", {}],
      ],
    },
  },
  updex: {
    label: "updex", kicker: "System extension manager",
    nav: [["Getting started", ["Overview", "Installation"]], ["Usage", ["Discovering features", "Enabling extensions", "Updates and retention"]], ["Reference", ["CLI", "JSON output", "Go SDK"]]],
    page: {
      title: "Enabling extensions",
      toc: ["Discover features", "Enable with merge", "Verify state"],
      sections: [
        ["Discover features", "Updex reads ordinary transfer definitions from /usr/lib/sysupdate.d and component-scoped directories, then lists every published feature with its current and available versions.", { code: "updex features" }],
        ["Enable with merge", "Enabling downloads the versioned artifact, verifies its SHA256 manifest (and GPG signature when published), and asks systemd-sysext to merge the overlay immediately with --now.", { code: "updex enable podman --now" }],
        ["Verify state", "Installed and merged state comes straight from systemd-sysext. Version retention is bounded, so retired versions are cleaned up automatically.", { callout: ["Boundary", "Updex never modifies the base image. Extensions are versioned, removable overlays — disable one and the base is exactly as it was."] }],
      ],
    },
  },
  chairlift: {
    label: "ChairLift", kicker: "Desktop system workspace",
    nav: [["Getting started", ["Overview", "Installation"]], ["Workspace", ["System updates", "Homebrew", "Flatpak", "Extension features"]], ["Reference", ["Maintenance shortcuts"]]],
    page: {
      title: "System updates",
      toc: ["Staging a deployment", "Inspecting changes", "Rebooting into it"],
      sections: [
        ["Staging a deployment", "ChairLift stages operating system updates in the background. The current system keeps running; the new deployment waits until you choose to reboot into it.", {}],
        ["Inspecting changes", "Before rebooting, review exactly what the new image changes: package versions, kernel, and configuration. No surprises at boot.", { callout: ["Quiet by design", "ChairLift surfaces state and stages work. It does not nag, auto-reboot, or hide what the system below is doing."] }],
        ["Rebooting into it", "Reboot when it suits the work. The previous deployment stays available as a clear path back.", { code: "chairlift" }],
      ],
    },
  },
};