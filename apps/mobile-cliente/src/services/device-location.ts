import * as Location from "expo-location";
export class DeviceLocationError extends Error {
  constructor(
    message: string,
    public settings = false,
  ) {
    super(message);
  }
}
/** Foreground only; called by an explicit user action, never on screen mount. */
export async function deviceLocation(): Promise<{ lat: number; lon: number }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted)
    throw new DeviceLocationError(
      "Permite la ubicación en los ajustes del teléfono o busca una calle y ciudad.",
      true,
    );
  if (!(await Location.hasServicesEnabledAsync()))
    throw new DeviceLocationError(
      "Activa la ubicación del teléfono o escribe una calle y ciudad.",
      true,
    );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new DeviceLocationError(
                "No pudimos obtener tu ubicación. Prueba al aire libre o busca tu calle y ciudad.",
              ),
            ),
          15000,
        );
      }),
    ]);
    return { lat: position.coords.latitude, lon: position.coords.longitude };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
